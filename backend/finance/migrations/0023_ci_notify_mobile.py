from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0022_ci_notify_address_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='commercialinvoice',
            name='notify_mobile',
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
