from django.apps import AppConfig


class QualityConfig(AppConfig):
    name = 'quality'

    def ready(self):
        from . import signals  # noqa: F401
