from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0028_order_separate_coa_msds_per_group'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='balance_overdue_reminder_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='advance_overdue_reminder_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
