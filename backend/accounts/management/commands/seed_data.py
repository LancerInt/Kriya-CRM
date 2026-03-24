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
        admin.set_password('admin123')
        admin.save()

        manager, _ = User.objects.update_or_create(
            username='priya',
            defaults={
                'email': 'priya@kriya.com',
                'first_name': 'Priya',
                'last_name': 'Patel',
                'role': 'manager',
                'is_staff': True,
                'region': '',
            }
        )
        manager.set_password('manager123')
        manager.save()

        exec_rahul, _ = User.objects.update_or_create(
            username='rahul',
            defaults={
                'email': 'rahul@kriya.com',
                'first_name': 'Rahul',
                'last_name': 'Sharma',
                'role': 'executive',
                'region': 'South Asia',
            }
        )
        exec_rahul.set_password('exec123')
        exec_rahul.save()

        exec_anita, _ = User.objects.update_or_create(
            username='anita',
            defaults={
                'email': 'anita@kriya.com',
                'first_name': 'Anita',
                'last_name': 'Desai',
                'role': 'executive',
                'region': 'Africa',
            }
        )
        exec_anita.set_password('exec123')
        exec_anita.save()

        exec_vikram, _ = User.objects.update_or_create(
            username='vikram',
            defaults={
                'email': 'vikram@kriya.com',
                'first_name': 'Vikram',
                'last_name': 'Singh',
                'role': 'executive',
                'region': 'Americas',
            }
        )
        exec_vikram.set_password('exec123')
        exec_vikram.save()

        exec_meera, _ = User.objects.update_or_create(
            username='meera',
            defaults={
                'email': 'meera@kriya.com',
                'first_name': 'Meera',
                'last_name': 'Nair',
                'role': 'executive',
                'region': 'Europe',
            }
        )
        exec_meera.set_password('exec123')
        exec_meera.save()

        exec_arjun, _ = User.objects.update_or_create(
            username='arjun',
            defaults={
                'email': 'arjun@kriya.com',
                'first_name': 'Arjun',
                'last_name': 'Kapoor',
                'role': 'executive',
                'region': 'East Asia & Pacific',
            }
        )
        exec_arjun.set_password('exec123')
        exec_arjun.save()

        exec_sneha, _ = User.objects.update_or_create(
            username='sneha',
            defaults={
                'email': 'sneha@kriya.com',
                'first_name': 'Sneha',
                'last_name': 'Reddy',
                'role': 'executive',
                'region': 'Middle East',
            }
        )
        exec_sneha.set_password('exec123')
        exec_sneha.save()

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
            {'company_name': 'AgriGlobal LLC', 'country': 'USA', 'city': 'Houston', 'business_type': 'Distributor', 'preferred_currency': 'USD', 'credit_days': 30, 'credit_limit': 50000, 'delivery_terms': 'CIF', 'primary_executive': exec_vikram},
            {'company_name': 'EuroFarm GmbH', 'country': 'Germany', 'city': 'Hamburg', 'business_type': 'Importer', 'preferred_currency': 'EUR', 'credit_days': 45, 'credit_limit': 75000, 'delivery_terms': 'FOB', 'primary_executive': exec_meera},
            {'company_name': 'AgroTech Kenya', 'country': 'Kenya', 'city': 'Nairobi', 'business_type': 'Distributor', 'preferred_currency': 'USD', 'credit_days': 30, 'credit_limit': 25000, 'delivery_terms': 'CFR', 'primary_executive': exec_anita},
            {'company_name': 'BioHarvest Brazil', 'country': 'Brazil', 'city': 'Sao Paulo', 'business_type': 'Manufacturer', 'preferred_currency': 'USD', 'credit_days': 60, 'credit_limit': 100000, 'delivery_terms': 'FOB', 'primary_executive': exec_vikram},
            {'company_name': 'GreenFields Vietnam', 'country': 'Vietnam', 'city': 'Ho Chi Minh', 'business_type': 'Importer', 'preferred_currency': 'USD', 'credit_days': 30, 'credit_limit': 30000, 'delivery_terms': 'CIF', 'primary_executive': exec_arjun},
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
            defaults={'assigned_to': exec_vikram, 'source': 'email', 'stage': 'quotation', 'quantity': '10 MT', 'expected_value': 12000, 'requirements': 'Need 25kg bags, palletized'}
        )
        Inquiry.objects.get_or_create(
            client=clients[1], product_name='Seaweed Extract',
            defaults={'assigned_to': exec_meera, 'source': 'whatsapp', 'stage': 'discussion', 'quantity': '5 MT', 'expected_value': 12500}
        )
        Inquiry.objects.get_or_create(
            client=clients[2], product_name='NPK 19-19-19',
            defaults={'assigned_to': exec_anita, 'source': 'manual', 'stage': 'inquiry', 'quantity': '20 MT', 'expected_value': 16000}
        )

        # ── Tasks ─────────────────────────────────────────────

        Task.objects.get_or_create(
            title='Follow up on Humic Acid inquiry - AgriGlobal',
            defaults={'client': clients[0], 'owner': exec_vikram, 'created_by': admin, 'priority': 'high', 'description': 'Client interested in 10 MT. Prepare quotation.'}
        )
        Task.objects.get_or_create(
            title='Send product catalog to EuroFarm',
            defaults={'client': clients[1], 'owner': exec_meera, 'created_by': manager, 'priority': 'medium'}
        )
        Task.objects.get_or_create(
            title='Collect feedback on NPK sample from AgroTech',
            defaults={'client': clients[2], 'owner': exec_anita, 'created_by': admin, 'priority': 'high', 'is_auto_generated': True}
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
        self.stdout.write(f'  {"Admin":<12} {"admin":<12} {"admin123":<14} {"Admin User":<20} {"—":<20}')
        self.stdout.write(f'  {"Manager":<12} {"priya":<12} {"manager123":<14} {"Priya Patel":<20} {"—":<20}')
        self.stdout.write(f'  {"Executive":<12} {"rahul":<12} {"exec123":<14} {"Rahul Sharma":<20} {"South Asia":<20}')
        self.stdout.write(f'  {"Executive":<12} {"anita":<12} {"exec123":<14} {"Anita Desai":<20} {"Africa":<20}')
        self.stdout.write(f'  {"Executive":<12} {"vikram":<12} {"exec123":<14} {"Vikram Singh":<20} {"Americas":<20}')
        self.stdout.write(f'  {"Executive":<12} {"meera":<12} {"exec123":<14} {"Meera Nair":<20} {"Europe":<20}')
        self.stdout.write(f'  {"Executive":<12} {"arjun":<12} {"exec123":<14} {"Arjun Kapoor":<20} {"East Asia & Pacific":<20}')
        self.stdout.write(f'  {"Executive":<12} {"sneha":<12} {"exec123":<14} {"Sneha Reddy":<20} {"Middle East":<20}')
        self.stdout.write('=' * 60)
