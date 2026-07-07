import hashlib
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import AuditLog, Session, User

# ---------------------------------------------------------------------------
# Cookie names & lifetimes
# ---------------------------------------------------------------------------

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
ACCESS_MAX_AGE = 15 * 60          # 15 minutes
REFRESH_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def _build_token_pair(user, session_id: str):
    """Return (access_token_str, refresh_token_str) with custom claims."""
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token

    # Custom claims embedded in the access token
    access["role"] = user.role
    access["username"] = user.username
    access["full_name"] = user.get_full_name()
    access["branch_id"] = user.branch_id
    access["session_id"] = session_id

    return str(access), str(refresh)


def _set_auth_cookies(response, access_token: str, refresh_token: str):
    """Attach both tokens as HttpOnly cookies to the response.

    In production the frontend and backend live on different Railway
    subdomains, which makes every API call cross-site. SameSite=Lax blocks
    cookies on cross-site fetch/XHR (it only allows them on top-level
    navigation), so the browser would silently drop the auth cookies on
    every request after login. SameSite=None is required for cross-site
    cookies, and browsers require Secure whenever SameSite=None is used.
    """
    secure = not settings.DEBUG
    samesite = "None" if secure else "Lax"
    response.set_cookie(
        ACCESS_COOKIE, access_token,
        httponly=True, secure=secure, samesite=samesite,
        max_age=ACCESS_MAX_AGE,
    )
    response.set_cookie(
        REFRESH_COOKIE, refresh_token,
        httponly=True, secure=secure, samesite=samesite,
        max_age=REFRESH_MAX_AGE,
    )


def _clear_auth_cookies(response):
    # Browsers only honour a cookie deletion if SameSite matches how the
    # cookie was originally set — must mirror _set_auth_cookies exactly.
    samesite = "None" if not settings.DEBUG else "Lax"
    response.delete_cookie(ACCESS_COOKIE, samesite=samesite)
    response.delete_cookie(REFRESH_COOKIE, samesite=samesite)


def _user_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.get_full_name(),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "branch_id": user.branch_id,
        "phone_number": user.phone_number,
    }


def _audit(user, action, request, severity="info", metadata=None):
    AuditLog.objects.create(
        user=user,
        action=action,
        ip_address=_get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        severity=severity,
        metadata=metadata or {},
    )


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

class LoginView(APIView):
    """POST /api/auth/login/"""
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")

        user = authenticate(request, username=username, password=password)

        if not user or not user.is_active:
            _audit(
                None, "login_failed", request,
                severity="warning",
                metadata={"username": username},
            )
            return Response({"detail": "Invalid credentials."}, status=401)

        # Create session record (refresh token stored as hash)
        session = Session.objects.create(
            user=user,
            token_hash="pending",  # updated after token generation
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            ip_address=_get_client_ip(request),
            device_name=request.data.get("device_name", ""),
            expires_at=timezone.now() + timedelta(seconds=REFRESH_MAX_AGE),
        )

        access_token, refresh_token = _build_token_pair(user, str(session.id))

        # Store hash of refresh token, never the raw value
        session.token_hash = _hash_token(refresh_token)
        session.save(update_fields=["token_hash"])

        _audit(user, "login", request, metadata={"session_id": str(session.id)})

        response = Response({"user": _user_payload(user)})
        _set_auth_cookies(response, access_token, refresh_token)
        return response


class LogoutView(APIView):
    """POST /api/auth/logout/ — clears cookies and revokes the session."""
    permission_classes = [AllowAny]

    def post(self, request):
        # Revoke the session if we can identify it
        token = request.COOKIES.get(ACCESS_COOKIE)
        if token:
            try:
                from rest_framework_simplejwt.tokens import AccessToken
                payload = AccessToken(token)
                session_id = payload.get("session_id")
                if session_id:
                    Session.objects.filter(id=session_id).update(is_revoked=True)
            except (TokenError, Exception):
                pass

        _audit(request.user if request.user.is_authenticated else None,
               "logout", request)

        response = Response({"detail": "Logged out."})
        _clear_auth_cookies(response)
        return response


class RefreshView(APIView):
    """POST /api/auth/refresh/ — rotates the refresh token, issues new access token."""
    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return Response({"detail": "No refresh token."}, status=401)

        token_hash = _hash_token(raw_refresh)

        try:
            session = Session.objects.select_related("user").get(
                token_hash=token_hash,
                is_revoked=False,
                expires_at__gt=timezone.now(),
            )
        except Session.DoesNotExist:
            return Response({"detail": "Session expired or revoked."}, status=401)

        # Validate the refresh token with simplejwt
        try:
            old_token = RefreshToken(raw_refresh)
        except TokenError:
            session.is_revoked = True
            session.save(update_fields=["is_revoked"])
            return Response({"detail": "Invalid refresh token."}, status=401)

        # Blacklist the old token and issue new pair (rotation)
        try:
            old_token.blacklist()
        except Exception:
            pass  # blacklist app may not be installed

        access_token, new_refresh = _build_token_pair(session.user, str(session.id))

        # Update stored hash to new refresh token
        session.token_hash = _hash_token(new_refresh)
        session.expires_at = timezone.now() + timedelta(seconds=REFRESH_MAX_AGE)
        session.save(update_fields=["token_hash", "expires_at"])

        _audit(session.user, "token_refresh", request,
               metadata={"session_id": str(session.id)})

        response = Response({"user": _user_payload(session.user)})
        _set_auth_cookies(response, access_token, new_refresh)
        return response


class MeView(APIView):
    """GET /api/auth/me/ — returns the authenticated user's profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"user": _user_payload(request.user)})


class SessionListView(APIView):
    """GET /api/users/profile/sessions/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = Session.objects.filter(
            user=request.user,
            is_revoked=False,
            expires_at__gt=timezone.now(),
        ).values("id", "user_agent", "ip_address", "device_name",
                 "created_at", "last_activity")
        return Response(list(sessions))


class RevokeAllSessionsView(APIView):
    """POST /api/users/profile/sessions/revoke-all/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        count, _ = Session.objects.filter(
            user=request.user, is_revoked=False
        ).update(is_revoked=True)
        _audit(request.user, "revoke_all_sessions", request,
               severity="warning", metadata={"revoked_count": count})
        return Response({"revoked": count})


class ProfileView(APIView):
    """PATCH /api/auth/profile/ — update name and phone number."""
    permission_classes = [IsAuthenticated]

    EDITABLE = ("first_name", "last_name", "phone_number")

    def patch(self, request):
        user = request.user
        changed = []
        for field in self.EDITABLE:
            if field in request.data:
                setattr(user, field, str(request.data[field]).strip())
                changed.append(field)
        if changed:
            user.save(update_fields=changed)
        return Response({"user": _user_payload(user)})


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = request.data.get("current_password", "")
        new_pw  = request.data.get("new_password", "")

        if not request.user.check_password(current):
            return Response({"detail": "Current password is incorrect."}, status=400)

        is_technician = request.user.role == User.Role.TECHNICIAN
        if is_technician:
            if not (new_pw.isdigit() and len(new_pw) == 4):
                return Response(
                    {"detail": "PIN must be exactly 4 digits."}, status=400
                )
        else:
            if len(new_pw) < 8:
                return Response(
                    {"detail": "Password must be at least 8 characters."}, status=400
                )

        request.user.set_password(new_pw)
        request.user.save(update_fields=["password"])
        _audit(request.user, "password_changed", request, severity="warning")
        return Response({"detail": "Updated successfully."})
