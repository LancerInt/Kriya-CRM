from django.urls import path
from .recycle_bin import recycle_bin_list, recycle_bin_restore, recycle_bin_purge, recycle_bin_empty, recycle_bin_preview

urlpatterns = [
    path('', recycle_bin_list, name='recycle-bin-list'),
    path('preview/', recycle_bin_preview, name='recycle-bin-preview'),
    path('restore/', recycle_bin_restore, name='recycle-bin-restore'),
    path('purge/', recycle_bin_purge, name='recycle-bin-purge'),
    path('empty/', recycle_bin_empty, name='recycle-bin-empty'),
]
