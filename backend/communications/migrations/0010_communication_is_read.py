from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communications', '0009_communication_classification'),
    ]

    operations = [
        migrations.AddField(
            model_name='communication',
            name='is_read',
            field=models.BooleanField(default=False, db_index=True, help_text='True if this communication has been read'),
        ),
    ]
