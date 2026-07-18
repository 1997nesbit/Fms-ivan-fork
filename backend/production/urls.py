from django.urls import path

from .views import (
    AssignItemStagesView,
    CompleteStageView,
    MyEarningsView,
    MyQueueView,
    OpsQueueView,
    PaymentListView,
    PipelineView,
    SetItemWagesView,
    SettlePaymentsView,
    StartWorkView,
)

urlpatterns = [
    path("my-queue/", MyQueueView.as_view(), name="production_my_queue"),
    path("my-earnings/", MyEarningsView.as_view(), name="production_my_earnings"),
    path("payments/", PaymentListView.as_view(), name="production_payments"),
    path("payments/<str:week>/settle/", SettlePaymentsView.as_view(), name="production_settle_payments"),
    path("stages/<int:pk>/complete/", CompleteStageView.as_view(), name="production_stage_complete"),
    path("ops-queue/", OpsQueueView.as_view(), name="production_ops_queue"),
    path("pipeline/", PipelineView.as_view(), name="production_pipeline"),
    path("items/<int:item_id>/assign-stages/", AssignItemStagesView.as_view(), name="production_assign_item_stages"),
    path("items/<int:item_id>/set-wages/", SetItemWagesView.as_view(), name="production_set_item_wages"),
    path("orders/<int:pk>/start-work/", StartWorkView.as_view(), name="production_start_work"),
]
