from django.urls import path
from .recycle_bin import recycle_bin_list, recycle_bin_restore, recycle_bin_purge, recycle_bin_empty

urlpatterns = [
    path('', recycle_bin_list, name='recycle-bin-list'),
    path('restore/', recycle_bin_restore, name='recycle-bin-restore'),
    path('purge/', recycle_bin_purge, name='recycle-bin-purge'),
    path('empty/', recycle_bin_empty, name='recycle-bin-empty'),
]
