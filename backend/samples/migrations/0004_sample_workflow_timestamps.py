from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('samples', '0003_sample_source_communication_and_client_brand'),
    ]

    operations = [
        migrations.AddField(
            model_name='sample',
            name='replied_at',
            field=models.DateTimeField(
                blank=True, null=True,
                help_text='When we sent the reply email acknowledging the request',
            ),
        ),
        migrations.AddField(
            model_name='sample',
            name='prepared_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='sample',
            name='delivered_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
