from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0027_order_payment_phase_overrides'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='separate_coa_msds_per_group',
            field=models.BooleanField(default=False),
        ),
    ]
