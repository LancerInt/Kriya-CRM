from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0002_product_hsn_code_product_unit'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='client_brand_names',
            field=models.TextField(
                blank=True, default='',
                help_text='Comma-separated alternate names clients use for this product',
            ),
        ),
    ]
