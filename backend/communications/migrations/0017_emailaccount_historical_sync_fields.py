from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communications', '0016_communication_email_references'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailaccount',
            name='historical_sync_status',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='emailaccount',
            name='historical_sync_started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='emailaccount',
            name='historical_sync_completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='emailaccount',
            name='historical_sync_days_back',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='emailaccount',
            name='historical_sync_imported',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='emailaccount',
            name='historical_sync_error',
            field=models.TextField(blank=True, default=''),
        ),
    ]
