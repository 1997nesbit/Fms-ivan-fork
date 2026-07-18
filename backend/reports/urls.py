from django.urls import path

from .views import (
    InvoiceListCreateView,
    InvoiceDetailView,
    LogPaymentView,
    ShowroomSalesReportView,
    BranchPerformanceReportView,
    ProductionCostReportView,
    CustomOrderSalesReportView,
    CombinedSalesLedgerView,
    StockAvailabilityReportView,
    IndividualTechnicianPayReportView,
    SnapshotReportView,
)

urlpatterns = [
    path("invoices/",         InvoiceListCreateView.as_view()),
    path("invoices/<int:pk>/", InvoiceDetailView.as_view()),
    path("invoices/<int:pk>/payments/", LogPaymentView.as_view()),
    path("showroom-sales/",   ShowroomSalesReportView.as_view()),
    path("branch-performance/", BranchPerformanceReportView.as_view()),
    path("production-cost/",  ProductionCostReportView.as_view()),
    path("custom-order-sales/", CustomOrderSalesReportView.as_view()),
    path("combined-sales-ledger/", CombinedSalesLedgerView.as_view()),
    path("stock-availability/", StockAvailabilityReportView.as_view()),
    path("technician-pay/",   IndividualTechnicianPayReportView.as_view()),
    path("snapshot/",         SnapshotReportView.as_view()),
]
