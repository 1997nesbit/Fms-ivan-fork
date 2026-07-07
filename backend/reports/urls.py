from django.urls import path

from .views import (
    InvoiceListCreateView,
    InvoiceDetailView,
    ShowroomSalesReportView,
    BranchPerformanceReportView,
    ProductionCostReportView,
)

urlpatterns = [
    path("invoices/",         InvoiceListCreateView.as_view()),
    path("invoices/<int:pk>/", InvoiceDetailView.as_view()),
    path("showroom-sales/",   ShowroomSalesReportView.as_view()),
    path("branch-performance/", BranchPerformanceReportView.as_view()),
    path("production-cost/",  ProductionCostReportView.as_view()),
]
