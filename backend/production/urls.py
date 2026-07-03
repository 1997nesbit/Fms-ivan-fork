from django.urls import path

from .views import (
    AssignStagesView,
    CompleteStageView,
    MyEarningsView,
    MyQueueView,
    OpsQueueView,
    PipelineView,
    SetWagesView,
    StartWorkView,
)

urlpatterns = [
    path("my-queue/", MyQueueView.as_view(), name="production_my_queue"),
    path("my-earnings/", MyEarningsView.as_view(), name="production_my_earnings"),
    path("stages/<int:pk>/complete/", CompleteStageView.as_view(), name="production_stage_complete"),
    path("ops-queue/", OpsQueueView.as_view(), name="production_ops_queue"),
    path("pipeline/", PipelineView.as_view(), name="production_pipeline"),
    path("orders/<int:pk>/assign-stages/", AssignStagesView.as_view(), name="production_assign_stages"),
    path("orders/<int:pk>/set-wages/", SetWagesView.as_view(), name="production_set_wages"),
    path("orders/<int:pk>/start-work/", StartWorkView.as_view(), name="production_start_work"),
]
