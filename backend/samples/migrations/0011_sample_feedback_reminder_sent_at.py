from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('samples', '0010_sample_sample_type_locked_alter_sample_sample_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='sample',
            name='feedback_reminder_sent_at',
            field=models.DateTimeField(blank=True, help_text='When the post-delivery feedback reminder was sent to the executive/admin/manager', null=True),
        ),
    ]
