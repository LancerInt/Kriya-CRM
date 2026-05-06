from django.apps import AppConfig


class FinanceConfig(AppConfig):
    name = 'finance'

    def ready(self):
        # Wire CI -> Order payment_terms sync.
        from . import signals  # noqa: F401
