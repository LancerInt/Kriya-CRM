from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0019_firc_order_sample_links'),
    ]

    operations = [
        migrations.AddField(
            model_name='commercialinvoice',
            name='buyer_company_name',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='commercialinvoice',
            name='buyer_address',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='commercialinvoice',
            name='buyer_pincode',
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name='commercialinvoice',
            name='buyer_city_state_country',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='commercialinvoice',
            name='buyer_phone',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='commercialinvoice',
            name='buyer_reference',
            field=models.CharField(blank=True, help_text='e.g. REF: S26-10052 / PO 00135', max_length=255),
        ),
    ]
