from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0025_order_last_transit_reminder_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='advance_payment_received_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='balance_payment_received_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='balance_reminder_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
