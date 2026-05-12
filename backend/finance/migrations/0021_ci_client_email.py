from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0020_ci_buyer_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='commercialinvoice',
            name='client_email',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
