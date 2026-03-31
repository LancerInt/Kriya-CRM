from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0007_commercialinvoice_display_overrides'),
    ]

    operations = [
        migrations.AddField(
            model_name='proformainvoiceitem',
            name='client_product_name',
            field=models.CharField(blank=True, default='', help_text='Product name as the client calls it', max_length=255),
        ),
        migrations.AddField(
            model_name='commercialinvoiceitem',
            name='client_product_name',
            field=models.CharField(blank=True, default='', help_text='Product name as the client calls it', max_length=255),
        ),
    ]
