from django.urls import path

from .views import SaleListCreateView, ShowroomItemListCreateView

urlpatterns = [
    path("items/", ShowroomItemListCreateView.as_view()),
    path("sales/", SaleListCreateView.as_view()),
]
