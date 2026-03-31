from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quotations', '0005_quotation_display_overrides'),
    ]

    operations = [
        migrations.AddField(
            model_name='quotationitem',
            name='client_product_name',
            field=models.CharField(blank=True, default='', help_text='Product name as the client calls it', max_length=255),
        ),
    ]
