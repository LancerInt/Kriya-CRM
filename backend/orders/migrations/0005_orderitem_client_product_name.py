from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0004_order_confirmed_at_order_container_booked_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderitem',
            name='client_product_name',
            field=models.CharField(blank=True, default='', help_text='Product name as the client calls it', max_length=255),
        ),
    ]
