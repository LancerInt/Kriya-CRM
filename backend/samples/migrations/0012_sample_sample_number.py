from django.db import migrations, models


def backfill_sample_numbers(apps, schema_editor):
    Sample = apps.get_model('samples', 'Sample')
    for idx, s in enumerate(Sample.objects.all().order_by('created_at', 'id'), start=1):
        if not s.sample_number:
            s.sample_number = f'SMP-{idx:05d}'
            s.save(update_fields=['sample_number'])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('samples', '0011_sample_feedback_reminder_sent_at'),
    ]

    operations = [
        # Step 1: add field plain (no unique, no index) so existing rows
        # can carry the default '' without colliding.
        migrations.AddField(
            model_name='sample',
            name='sample_number',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        # Step 2: backfill SMP-NNNNN by creation order.
        migrations.RunPython(backfill_sample_numbers, reverse_noop),
        # Step 3: now apply uniqueness + index in a single AlterField.
        migrations.AlterField(
            model_name='sample',
            name='sample_number',
            field=models.CharField(blank=True, db_index=True, default='', help_text='Human-readable shipment number, e.g. SMP-00001', max_length=20, unique=True),
        ),
    ]
