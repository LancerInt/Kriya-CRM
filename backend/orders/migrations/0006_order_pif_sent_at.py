from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0005_orderitem_client_product_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='pif_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
