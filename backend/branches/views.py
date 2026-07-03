from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Branch


def _branch_payload(branch):
    return {
        "id": branch.id,
        "name": branch.name,
        "location": branch.location,
    }


class BranchListView(APIView):
    """GET /api/branches/ — list active branches (any authenticated role)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        branches = Branch.objects.filter(is_active=True).order_by("name")
        return Response({"results": [_branch_payload(b) for b in branches]})
