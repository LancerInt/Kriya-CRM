from django.db import migrations, models


def backfill_signature_names(apps, schema_editor):
    """Pre-fill signature_name for known users using the requested format."""
    User = apps.get_model('accounts', 'User')
    # Map first-name (case-insensitive) → signature display name
    mapping = {
        'shobana': 'Shobana C',
        'moulee': 'Moulee S',
        'indra': 'Indra P',
        'dinesh': 'Dinesh Kumar N',
    }
    for u in User.objects.all():
        if u.signature_name:
            continue
        first = (u.first_name or u.username or '').strip().lower()
        for key, sig in mapping.items():
            if key in first:
                u.signature_name = sig
                u.save(update_fields=['signature_name'])
                break


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0004_add_executive_shadow'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='signature_name',
            field=models.CharField(
                blank=True, default='', max_length=120,
                help_text='Display name in the email signature, e.g. "Shobana C"',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='signature_phone',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='user',
            name='signature_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
        migrations.RunPython(backfill_signature_names, reverse_code=migrations.RunPython.noop),
    ]
