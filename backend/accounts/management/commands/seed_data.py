from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from clients.models import Client, Contact, ClientPort
from products.models import Product
from quotations.models import Inquiry
from tasks.models import Task

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed database with demo data'

    def handle(self, *args, **options):
        self.stdout.write('Seeding database...')

        # ── Users ──────────────────────────────────────────────

        admin, _ = User.objects.update_or_create(
            username='admin',
            defaults={
                'email': 'admin@kriya.com',
                'first_name': 'Admin',
                'last_name': 'User',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
                'region': '',
            }
        )
        admin.set_password('admin123')  # {username}123
        admin.save()

        manager, _ = User.objects.update_or_create(
            username='shobana',
            defaults={
                'email': 'shobana@kriya.com',
                'first_name': 'Shobana',
                'last_name': '',
                'role': 'manager',
                'is_staff': True,
                'region': '',
            }
        )
        manager.set_password('shobana123')  # {username}123
        manager.save()

        exec_dinesh, _ = User.objects.update_or_create(
            username='dinesh',
            defaults={
                'email': 'dinesh@kriya.com',
                'first_name': 'Dinesh',
                'last_name': '',
                'role': 'executive',
                'region': 'South Asia',
            }
        )
        exec_dinesh.set_password('dinesh123')  # {username}123
        exec_dinesh.save()

        exec_moulee, _ = User.objects.update_or_create(
            username='moulee',
            defaults={
                'email': 'moulee@kriya.com',
                'first_name': 'Moulee',
                'last_name': '',
                'role': 'executive',
                'region': 'Africa',
            }
        )
        exec_moulee.set_password('moulee123')  # {username}123
        exec_moulee.save()

        exec_indra, _ = User.objects.update_or_create(
            username='indra',
            defaults={
                'email': 'indra@kriya.com',
                'first_name': 'Indra',
                'last_name': '',
                'role': 'executive',
                'region': 'Americas',
            }
        )
        exec_indra.set_password('indra123')  # {username}123
        exec_indra.save()

        # ── Products ──────────────────────────────────────────

        products_data = [
            {'name': 'Humic Acid 90%', 'category': 'Soil Conditioner', 'active_ingredient': 'Humic Acid', 'concentration': '90%', 'base_price': 1200},
            {'name': 'Seaweed Extract', 'category': 'Bio Stimulant', 'active_ingredient': 'Ascophyllum Nodosum', 'concentration': '100%', 'base_price': 2500},
            {'name': 'Amino Acid 80%', 'category': 'Plant Growth', 'active_ingredient': 'L-Amino Acids', 'concentration': '80%', 'base_price': 1800},
            {'name': 'Fulvic Acid 90%', 'category': 'Soil Conditioner', 'active_ingredient': 'Fulvic Acid', 'concentration': '90%', 'base_price': 1500},
            {'name': 'NPK 19-19-19', 'category': 'Fertilizer', 'active_ingredient': 'NPK Complex', 'concentration': '57%', 'base_price': 800},
            {'name': 'Potassium Humate', 'category': 'Soil Conditioner', 'active_ingredient': 'Potassium Humate', 'concentration': '85%', 'base_price': 1100},
        ]
        products = []
        for pd in products_data:
            p, _ = Product.objects.get_or_create(name=pd['name'], defaults=pd)
            products.append(p)

        # ── Clients (assigned to correct regional executives) ──

        clients_data = [
            {'company_name': 'AgriGlobal LLC', 'country': 'USA', 'city': 'Houston', 'business_type': 'Distributor', 'preferred_currency': 'USD', 'credit_days': 30, 'credit_limit': 50000, 'delivery_terms': 'CIF', 'primary_executive': exec_indra},
            {'company_name': 'EuroFarm GmbH', 'country': 'Germany', 'city': 'Hamburg', 'business_type': 'Importer', 'preferred_currency': 'EUR', 'credit_days': 45, 'credit_limit': 75000, 'delivery_terms': 'FOB', 'primary_executive': exec_moulee},
            {'company_name': 'AgroTech Kenya', 'country': 'Kenya', 'city': 'Nairobi', 'business_type': 'Distributor', 'preferred_currency': 'USD', 'credit_days': 30, 'credit_limit': 25000, 'delivery_terms': 'CFR', 'primary_executive': exec_moulee},
            {'company_name': 'BioHarvest Brazil', 'country': 'Brazil', 'city': 'Sao Paulo', 'business_type': 'Manufacturer', 'preferred_currency': 'USD', 'credit_days': 60, 'credit_limit': 100000, 'delivery_terms': 'FOB', 'primary_executive': exec_indra},
            {'company_name': 'GreenFields Vietnam', 'country': 'Vietnam', 'city': 'Ho Chi Minh', 'business_type': 'Importer', 'preferred_currency': 'USD', 'credit_days': 30, 'credit_limit': 30000, 'delivery_terms': 'CIF', 'primary_executive': exec_dinesh},
        ]

        # Clean up old clients that may have wrong executive assignments
        for cd in clients_data:
            Client.objects.filter(company_name=cd['company_name']).update(
                primary_executive=cd['primary_executive']
            )

        clients = []
        for cd in clients_data:
            c, _ = Client.objects.get_or_create(company_name=cd['company_name'], defaults=cd)
            # Update executive assignment on existing clients
            if c.primary_executive != cd['primary_executive']:
                c.primary_executive = cd['primary_executive']
                c.save()
            clients.append(c)

        # ── Contacts ──────────────────────────────────────────

        Contact.objects.get_or_create(client=clients[0], name='John Smith', defaults={'email': 'john@agriglobal.com', 'phone': '+1-555-0100', 'designation': 'Purchase Manager', 'is_primary': True})
        Contact.objects.get_or_create(client=clients[0], name='Sarah Johnson', defaults={'email': 'sarah@agriglobal.com', 'phone': '+1-555-0101', 'designation': 'Director'})
        Contact.objects.get_or_create(client=clients[1], name='Hans Mueller', defaults={'email': 'hans@eurofarm.de', 'phone': '+49-555-0200', 'designation': 'Import Manager', 'is_primary': True})
        Contact.objects.get_or_create(client=clients[2], name='James Ochieng', defaults={'email': 'james@agrotech.co.ke', 'phone': '+254-555-0300', 'designation': 'CEO', 'is_primary': True})
        Contact.objects.get_or_create(client=clients[3], name='Carlos Silva', defaults={'email': 'carlos@bioharvest.br', 'phone': '+55-555-0400', 'designation': 'Procurement', 'is_primary': True})

        # ── Ports ─────────────────────────────────────────────

        ClientPort.objects.get_or_create(client=clients[0], port_name='Houston Port')
        ClientPort.objects.get_or_create(client=clients[1], port_name='Hamburg Port')
        ClientPort.objects.get_or_create(client=clients[2], port_name='Mombasa Port')

        # ── Inquiries ─────────────────────────────────────────

        Inquiry.objects.get_or_create(
            client=clients[0], product_name='Humic Acid 90%',
            defaults={'assigned_to': exec_indra, 'source': 'email', 'stage': 'quotation', 'quantity': '10 MT', 'expected_value': 12000, 'requirements': 'Need 25kg bags, palletized'}
        )
        Inquiry.objects.get_or_create(
            client=clients[1], product_name='Seaweed Extract',
            defaults={'assigned_to': exec_moulee, 'source': 'whatsapp', 'stage': 'discussion', 'quantity': '5 MT', 'expected_value': 12500}
        )
        Inquiry.objects.get_or_create(
            client=clients[2], product_name='NPK 19-19-19',
            defaults={'assigned_to': exec_moulee, 'source': 'manual', 'stage': 'inquiry', 'quantity': '20 MT', 'expected_value': 16000}
        )

        # ── Tasks ─────────────────────────────────────────────

        Task.objects.get_or_create(
            title='Follow up on Humic Acid inquiry - AgriGlobal',
            defaults={'client': clients[0], 'owner': exec_indra, 'created_by': admin, 'priority': 'high', 'description': 'Client interested in 10 MT. Prepare quotation.'}
        )
        Task.objects.get_or_create(
            title='Send product catalog to EuroFarm',
            defaults={'client': clients[1], 'owner': exec_moulee, 'created_by': manager, 'priority': 'medium'}
        )
        Task.objects.get_or_create(
            title='Collect feedback on NPK sample from AgroTech',
            defaults={'client': clients[2], 'owner': exec_moulee, 'created_by': admin, 'priority': 'high', 'is_auto_generated': True}
        )

        # ── Summary ───────────────────────────────────────────

        self.stdout.write(self.style.SUCCESS('Database seeded successfully!'))
        self.stdout.write(f'  Users: {User.objects.count()}')
        self.stdout.write(f'  Clients: {Client.objects.count()}')
        self.stdout.write(f'  Products: {Product.objects.count()}')
        self.stdout.write(f'  Inquiries: {Inquiry.objects.count()}')
        self.stdout.write(f'  Tasks: {Task.objects.count()}')
        self.stdout.write('')
        self.stdout.write('=' * 60)
        self.stdout.write('  LOGIN CREDENTIALS')
        self.stdout.write('=' * 60)
        self.stdout.write(f'  {"Role":<12} {"Username":<12} {"Password":<14} {"Name":<20} {"Region":<20}')
        self.stdout.write('-' * 60)
        self.stdout.write(f'  {"Admin":<12} {"admin":<12} {"admin123":<14} {"Admin":<20} {"—":<20}')
        self.stdout.write(f'  {"Manager":<12} {"shobana":<12} {"shobana123":<14} {"Shobana":<20} {"—":<20}')
        self.stdout.write(f'  {"Executive":<12} {"dinesh":<12} {"dinesh123":<14} {"Dinesh":<20} {"South Asia":<20}')
        self.stdout.write(f'  {"Executive":<12} {"moulee":<12} {"moulee123":<14} {"Moulee":<20} {"Africa":<20}')
        self.stdout.write(f'  {"Executive":<12} {"indra":<12} {"indra123":<14} {"Indra":<20} {"Americas":<20}')
        self.stdout.write('=' * 60)
