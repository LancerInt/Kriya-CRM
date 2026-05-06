from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0026_order_payment_tracking'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='advance_is_before_dispatch',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='order',
            name='balance_is_before_dispatch',
            field=models.BooleanField(default=False),
        ),
    ]
