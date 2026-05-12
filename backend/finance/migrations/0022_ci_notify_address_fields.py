from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0021_ci_client_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='commercialinvoice',
            name='notify_city_state_country',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='commercialinvoice',
            name='notify_pincode',
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name='commercialinvoice',
            name='notify_tax_number',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='commercialinvoice',
            name='notify_email',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
