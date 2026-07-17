from django.contrib.auth.backends import ModelBackend

from .models import User


class CaseInsensitiveModelBackend(ModelBackend):
    """Same as Django's default ModelBackend, but matches usernames
    case-insensitively so "Gidion" and "gidion" log in to the same account.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)
        if username is None or password is None:
            return None

        try:
            user = User.objects.get(username__iexact=username)
        except User.DoesNotExist:
            User().set_password(password)  # mirror ModelBackend's timing-attack mitigation
            return None
        except User.MultipleObjectsReturned:
            user = User.objects.filter(username__iexact=username).order_by("id").first()

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
