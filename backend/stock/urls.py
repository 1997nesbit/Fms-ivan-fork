from django.urls import path

from .views import (
    InventoryAuditLogView,
    InventoryItemDetailView,
    InventoryItemListCreateView,
    IssuanceListCreateView,
    MaterialRequestListCreateView,
    MaterialRequestReviewView,
    RestockRequestListCreateView,
    RestockRequestReviewView,
    TechnicianListView,
)

urlpatterns = [
    path("items/",                              InventoryItemListCreateView.as_view()),
    path("items/<int:pk>/",                     InventoryItemDetailView.as_view()),
    path("material-requests/",                  MaterialRequestListCreateView.as_view()),
    path("material-requests/<int:pk>/review/",  MaterialRequestReviewView.as_view()),
    path("issuances/",                          IssuanceListCreateView.as_view()),
    path("restock-requests/",                   RestockRequestListCreateView.as_view()),
    path("restock-requests/<int:pk>/review/",   RestockRequestReviewView.as_view()),
    path("technicians/",                        TechnicianListView.as_view()),
    path("audit-log/",                          InventoryAuditLogView.as_view()),
]
