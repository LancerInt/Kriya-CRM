from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communications', '0008_quoterequest'),
    ]

    operations = [
        migrations.AddField(
            model_name='communication',
            name='is_client_mail',
            field=models.BooleanField(default=True, help_text='True if matched to a client'),
        ),
        migrations.AddField(
            model_name='communication',
            name='classification',
            field=models.CharField(
                choices=[
                    ('client', 'Client'),
                    ('promotion', 'Promotion'),
                    ('update', 'Update'),
                    ('social', 'Social'),
                    ('spam', 'Spam'),
                    ('unknown', 'Unknown'),
                ],
                default='client',
                db_index=True,
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='communication',
            name='is_classified',
            field=models.BooleanField(default=False, help_text='True if classification has been run'),
        ),
    ]
