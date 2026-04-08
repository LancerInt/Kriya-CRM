from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('samples', '0004_sample_workflow_timestamps'),
    ]

    operations = [
        migrations.AddField(
            model_name='sample',
            name='reminder_sent_at',
            field=models.DateTimeField(
                blank=True, null=True,
                help_text='When the post-reply follow-up reminder was sent to the executive',
            ),
        ),
    ]
