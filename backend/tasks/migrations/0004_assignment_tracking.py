from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('tasks', '0003_add_status_note'),
    ]

    operations = [
        migrations.AddField(
            model_name='task',
            name='assigned_at',
            field=models.DateTimeField(
                blank=True, null=True,
                help_text='When the task was first assigned to the current owner',
            ),
        ),
        migrations.AddField(
            model_name='task',
            name='last_reminder_sent_at',
            field=models.DateTimeField(
                blank=True, null=True,
                help_text='When the most recent due-date reminder was sent',
            ),
        ),
    ]
