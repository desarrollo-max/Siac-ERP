import { Component, OnInit, ChangeDetectionStrategy, signal, effect, computed, ChangeDetectorRef, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, FormControl } from '@angular/forms';
import { SupabaseService } from './services/supabase.service';
import { Empresa, Sucursal, Modulo, UsuarioParaAdmin } from './models/siac.models';

declare var google: any;

type AppView = 'launcher' | 'business_dashboard' | 'user_management';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AppComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private cdr = inject(ChangeDetectorRef);

  logoSrc = 'https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logo.png';
  logoIconSrc = 'https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/icono.png';

  // --- View State ---
  activeView = signal<AppView>('launcher');

  // --- Data Signals ---
  empresas = signal<Empresa[]>([]);
  modulos = signal<Modulo[]>([]);
  usuariosParaAdmin = signal<UsuarioParaAdmin[]>([]);
  
  activeCompanyId = signal<string | null>(null);
  sucursales = signal<Sucursal[]>([]);
  
  // --- UI State Signals ---
  isLoading = signal<boolean>(true);
  isSubmitting = signal<boolean>(false);
  
  // --- Computed Signals ---
  activeCompany = computed(() => this.empresas().find(e => e.id === this.activeCompanyId()));
  
  // --- Forms ---
  sucursalForm: FormGroup;
  empresaForm: FormGroup;

  // --- ACL Editing State ---
  editingUser = signal<UsuarioParaAdmin | null>(null);
  editedUserAccess = signal<Map<string, boolean>>(new Map());

  // --- Business Creation State ---
  isCreatingBusiness = signal<boolean>(false);

  // --- Google Maps State ---
  @ViewChild('addressInput') addressInput: ElementRef<HTMLInputElement>;
  @ViewChild('mapContainer') mapContainer: ElementRef<HTMLDivElement>;
  private map: any;
  private marker: any;
  private geocoder: any;
  mapsApiStatus = signal<'loading' | 'ready' | 'error'>('loading');


  constructor() {
    this.sucursalForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
      direccion: new FormControl('', Validators.required),
      latitud: new FormControl(0, Validators.required),
      longitud: new FormControl(0, Validators.required),
    });
    
    this.empresaForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
    });

    // Handle Google Maps API authentication errors
    (window as any).gm_authFailure = () => {
      this.mapsApiStatus.set('error');
    };

    effect(() => {
      const companyId = this.activeCompanyId();
      if (companyId) {
        this.loadCompanyData(companyId);
      }
    });

    effect(() => {
      if (this.activeView() === 'business_dashboard') {
        this.mapsApiStatus.set('loading');
        // Defer map initialization until the view is rendered
        setTimeout(() => this.setupGoogleMaps(), 100);
      }
    });
  }

  ngOnInit(): void {
    this.initializeApp();
  }

  private initializeApp(): void {
    this.isLoading.set(true);
    this.supabase.auth.getUser().subscribe(() => {
      this.supabase.getEmpresasUsuario().subscribe(empresas => {
        this.empresas.set(empresas);
        this.isLoading.set(false);
      });
      this.supabase.getModulos().subscribe(modulos => {
        this.modulos.set(modulos);
      });
      this.supabase.getTodosLosUsuariosConEmpresas().subscribe(usuarios => {
        this.usuariosParaAdmin.set(usuarios);
      });
    });
  }
  
  private loadCompanyData(companyId: string): void {
    this.isLoading.set(true);
    this.sucursales.set([]);

    this.supabase.getSucursales(companyId).subscribe(data => {
      this.sucursales.set(data)
      this.isLoading.set(false);
    });
  }

  getModulesForCompany(companyId: string): Modulo[] {
    return this.modulos().filter(m => m.company_id === companyId);
  }
  
  // --- Navigation Handlers ---
  navigateToBusiness(companyId: string): void {
    this.activeCompanyId.set(companyId);
    this.activeView.set('business_dashboard');
  }

  navigateToLauncher(): void {
    this.activeView.set('launcher');
    this.activeCompanyId.set(null);
  }

  navigateToUserManagement(): void {
    this.activeView.set('user_management');
  }

  // --- Form Handlers ---
  agregarSucursal(): void {
    if (this.sucursalForm.invalid || !this.activeCompanyId()) return;

    this.isSubmitting.set(true);
    const nuevaSucursal = {
      ...this.sucursalForm.value,
      company_id: this.activeCompanyId()!,
    };
    
    this.supabase.addSucursal(nuevaSucursal).subscribe(sucursal => {
      this.sucursales.update(list => [...list, sucursal]);
      this.sucursalForm.reset({ nombre: '', direccion: '', latitud: 0, longitud: 0 });
      this.isSubmitting.set(false);
    });
  }
  
  // --- ACL Management ---
  openAccessEditor(user: UsuarioParaAdmin): void {
    this.editingUser.set(user);
    const accessMap = new Map<string, boolean>();
    const userCompanyIds = new Set(user.empresas.map(e => e.id));
    for (const empresa of this.empresas()) {
      accessMap.set(empresa.id, userCompanyIds.has(empresa.id));
    }
    this.editedUserAccess.set(accessMap);
  }

  closeAccessEditor(): void {
    this.editingUser.set(null);
  }

  updateEditedAccess(companyId: string, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.editedUserAccess.update(map => {
      map.set(companyId, isChecked);
      return new Map(map);
    });
  }

  saveUserAccess(): void {
    const user = this.editingUser();
    if (!user) return;

    this.isSubmitting.set(true);
    const selectedCompanyIds = Array.from(this.editedUserAccess().entries())
      .filter(([, isSelected]) => isSelected)
      .map(([companyId]) => companyId);
    
    this.supabase.updateUserCompanyAccess(user.id, selectedCompanyIds).subscribe(() => {
      this.supabase.getTodosLosUsuariosConEmpresas().subscribe(usuarios => {
          this.usuariosParaAdmin.set(usuarios);
          this.isSubmitting.set(false);
          this.closeAccessEditor();
      });
    });
  }

  // --- Business Creation Handlers ---
  openCreateBusinessModal(): void {
    this.empresaForm.reset();
    this.isCreatingBusiness.set(true);
  }

  closeCreateBusinessModal(): void {
    this.isCreatingBusiness.set(false);
  }

  crearEmpresa(): void {
    if (this.empresaForm.invalid) return;

    this.isSubmitting.set(true);
    const nuevoNombre = this.empresaForm.value.nombre;
    
    this.supabase.addEmpresa({ nombre: nuevoNombre }).subscribe(empresa => {
      this.empresas.update(list => [...list, empresa]);
      this.supabase.getModulos().subscribe(modulos => this.modulos.set(modulos));
      this.isSubmitting.set(false);
      this.closeCreateBusinessModal();
    });
  }

  // --- Google Maps Integration ---
  private setupGoogleMaps(): void {
    if (this.mapsApiStatus() === 'error') {
      return;
    }

    if (typeof google === 'undefined' || typeof google.maps === 'undefined' || !this.addressInput || !this.mapContainer) {
      setTimeout(() => this.setupGoogleMaps(), 200);
      return;
    }
    
    try {
        this.initMap();
        this.initAutocomplete();
        this.geocoder = new google.maps.Geocoder();
        this.mapsApiStatus.set('ready');
    } catch (e) {
        console.error("Error initializing Google Maps:", e);
        this.mapsApiStatus.set('error');
    }
  }

  private initMap(): void {
    const initialCoords = { lat: 19.4326, lng: -99.1332 }; // Mexico City
    this.map = new google.maps.Map(this.mapContainer.nativeElement, {
      center: initialCoords,
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
    });

    this.marker = new google.maps.Marker({
      position: initialCoords,
      map: this.map,
      draggable: true,
    });

    this.marker.addListener('dragend', (event: any) => {
      const newPosition = { lat: event.latLng.lat(), lng: event.latLng.lng() };
      this.updateFormFromMarker(newPosition);
    });
  }

  private initAutocomplete(): void {
    const autocomplete = new google.maps.places.Autocomplete(this.addressInput.nativeElement, {
      types: ['address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const newPosition = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        this.updateMapAndForm(place.formatted_address, newPosition);
      }
    });
  }

  private updateMapAndForm(address: string | undefined, position: { lat: number, lng: number }): void {
    if (address) {
      this.sucursalForm.patchValue({ direccion: address });
    }
    this.sucursalForm.patchValue({
      latitud: position.lat,
      longitud: position.lng,
    });

    this.map.setCenter(position);
    this.marker.setPosition(position);
    this.cdr.detectChanges();
  }

  private updateFormFromMarker(position: { lat: number, lng: number }): void {
    this.geocoder.geocode({ location: position }, (results: any[], status: string) => {
      let address = 'Dirección no encontrada';
      if (status === 'OK' && results[0]) {
        address = results[0].formatted_address;
      }
      this.updateMapAndForm(address, position);
    });
  }
}