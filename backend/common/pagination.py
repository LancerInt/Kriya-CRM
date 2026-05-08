"""Custom DRF pagination — same as PageNumberPagination but honors a
per-request ``?page_size=`` query param up to ``max_page_size``. Lets pages
that need to render long lists (e.g. Activities after a 5y email backfill)
fetch more rows in one go, while keeping the global default at 20.

max_page_size is set high (5000) because the Activities / Communications
pages need to render years of mail history in a single scroll. If a
mailbox grows past this we should switch to virtualized infinite scroll
rather than continuing to bump this number.
"""
from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size_query_param = 'page_size'
    max_page_size = 5000
