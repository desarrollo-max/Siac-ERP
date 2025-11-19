import { Component, OnInit, ChangeDetectionStrategy, signal, effect, computed, ChangeDetectorRef, inject, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, FormControl } from '@angular/forms';
import { SupabaseService } from './services/supabase.service';
import { Empresa, Sucursal, Modulo, UsuarioParaAdmin } from './models/siac.models';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

declare var google: any;

type AppView = 'launcher' | 'business_dashboard' | 'user_management';
type LocationModuleState = 'view' | 'add' | 'edit';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AppComponent implements OnInit, OnDestroy {
  private supabase = inject(SupabaseService);
  private cdr = inject(ChangeDetectorRef);
  // FIX: Moved injection to constructor to resolve potential type inference issue with field initializers.
  private sanitizer: DomSanitizer;

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
  activeCompanyLogo = computed(() => this.activeCompany()?.logo_url || 'https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logo.png');
  activeCompanyIcon = computed(() => this.activeCompany()?.logo_icon_url || 'https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/icono.png');
  
  // --- Forms ---
  sucursalForm: FormGroup;
  empresaForm: FormGroup;
  editEmpresaForm: FormGroup;

  // --- ACL Editing State ---
  editingUser = signal<UsuarioParaAdmin | null>(null);
  editedUserAccess = signal<Map<string, boolean>>(new Map());

  // --- Business Creation/Editing State ---
  isCreatingBusiness = signal<boolean>(false);
  isEditingBusiness = signal<boolean>(false);

  // --- Location Module State ---
  locationModuleState = signal<LocationModuleState>('view');
  editingSucursal = signal<Sucursal | null>(null);

  // --- Google Maps State ---
  @ViewChild('addressInput') addressInput: ElementRef<HTMLInputElement>;
  @ViewChild('mapContainer') mapContainer: ElementRef<HTMLDivElement>;
  private map: any;
  private marker: any;
  private geocoder: any;
  mapsApiStatus = signal<'loading' | 'ready' | 'error'>('loading');
  
  // --- Address Selection Iframe ---
  addressSelectionUrl: SafeResourceUrl;

  constructor() {
    this.sanitizer = inject(DomSanitizer);
    this.addressSelectionUrl = this.sanitizer.bypassSecurityTrustResourceUrl('https://storage.googleapis.com/maps-solutions-zpjoyswxad/address-selection/124m/address-selection.html');
    
    this.sucursalForm = new FormGroup({
      id: new FormControl(null),
      nombre: new FormControl('', Validators.required),
      direccion: new FormControl('', Validators.required),
      latitud: new FormControl({ value: 0, disabled: true }, Validators.required),
      longitud: new FormControl({ value: 0, disabled: true }, Validators.required),
    });
    
    this.empresaForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
    });

    this.editEmpresaForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
      logo_url: new FormControl(''),
      logo_icon_url: new FormControl('')
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
        const state = this.locationModuleState();
        if (state === 'edit' && this.activeView() === 'business_dashboard') {
            this.mapsApiStatus.set('loading');
            setTimeout(() => this.initEditMap(), 100);
        }
    });
  }

  ngOnInit(): void {
    this.initializeApp();
    window.addEventListener('message', this.handleAddressSelectionMessage.bind(this));
  }
  
  ngOnDestroy(): void {
    window.removeEventListener('message', this.handleAddressSelectionMessage.bind(this));
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
    this.locationModuleState.set('view');
  }

  navigateToLauncher(): void {
    this.activeView.set('launcher');
    this.activeCompanyId.set(null);
  }

  navigateToUserManagement(): void {
    this.activeView.set('user_management');
  }

  // --- Location Module CRUD Handlers ---
  startAddingSucursal(): void {
    this.sucursalForm.reset({ latitud: 0, longitud: 0, direccion: '' });
    this.editingSucursal.set(null);
    this.locationModuleState.set('add');
  }

  startEditingSucursal(sucursal: Sucursal): void {
    this.editingSucursal.set(sucursal);
    this.sucursalForm.patchValue(sucursal);
    this.locationModuleState.set('edit');
  }

  cancelEditOrAdd(): void {
    this.locationModuleState.set('view');
    this.editingSucursal.set(null);
  }

  saveSucursal(): void {
    if (this.sucursalForm.invalid || !this.activeCompanyId()) return;
    this.isSubmitting.set(true);

    const formValue = this.sucursalForm.getRawValue(); // getRawValue to include disabled fields
    const sucursalData = {
      ...formValue,
      company_id: this.activeCompanyId()!,
    };
    
    if (this.editingSucursal()) { // It's an update
        this.supabase.updateSucursal(sucursalData).subscribe(updatedSucursal => {
            this.sucursales.update(list => list.map(s => s.id === updatedSucursal.id ? updatedSucursal : s));
            this.isSubmitting.set(false);
            this.cancelEditOrAdd();
        });
    } else { // It's a new one
        const { id, ...newSucursalData } = sucursalData;
        this.supabase.addSucursal(newSucursalData).subscribe(sucursal => {
            this.sucursales.update(list => [...list, sucursal]);
            this.isSubmitting.set(false);
            this.cancelEditOrAdd();
        });
    }
  }

  eliminarSucursal(sucursalId: number): void {
    if (confirm('¿Está seguro de que desea eliminar esta ubicación?')) {
        this.supabase.deleteSucursal(sucursalId).subscribe(() => {
            this.sucursales.update(list => list.filter(s => s.id !== sucursalId));
        });
    }
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

  // --- Business Creation/Editing Handlers ---
  openCreateBusinessModal(): void {
    this.empresaForm.reset();
    this.isCreatingBusiness.set(true);
  }

  closeCreateBusinessModal(): void {
    this.isCreatingBusiness.set(false);
  }
  
  openEditBusinessModal(): void {
    const company = this.activeCompany();
    if (company) {
      this.editEmpresaForm.patchValue(company);
      this.isEditingBusiness.set(true);
    }
  }

  closeEditBusinessModal(): void {
    this.isEditingBusiness.set(false);
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
  
  saveBusinessChanges(): void {
      if (this.editEmpresaForm.invalid || !this.activeCompanyId()) return;
      this.isSubmitting.set(true);
      
      const updatedData = {
          id: this.activeCompanyId()!,
          ...this.editEmpresaForm.value
      };

      this.supabase.updateEmpresa(updatedData).subscribe(updatedEmpresa => {
          this.empresas.update(list => list.map(e => e.id === updatedEmpresa.id ? updatedEmpresa : e));
          this.isSubmitting.set(false);
          this.closeEditBusinessModal();
      });
  }

  // --- Google Maps Integration for EDITING ---
  private initEditMap(): void {
    if (this.mapsApiStatus() === 'error') {
      return;
    }

    if (typeof google === 'undefined' || typeof google.maps === 'undefined' || !this.addressInput || !this.mapContainer) {
      setTimeout(() => this.initEditMap(), 200);
      return;
    }
    
    try {
        const isEditing = !!this.editingSucursal();
        const initialCoords = isEditing
          ? { lat: this.editingSucursal()!.latitud, lng: this.editingSucursal()!.longitud }
          : { lat: 19.4326, lng: -99.1332 }; // Default: Mexico City

        this.map = new google.maps.Map(this.mapContainer.nativeElement, {
          center: initialCoords,
          zoom: isEditing ? 16 : 12,
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

        this.geocoder = new google.maps.Geocoder();
        this.mapsApiStatus.set('ready');
    } catch (e) {
        console.error("Error initializing Google Maps:", e);
        this.mapsApiStatus.set('error');
    }
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

  // --- Iframe Message Handler for ADDING ---
  private handleAddressSelectionMessage(event: MessageEvent): void {
    if (event.origin !== 'https://storage.googleapis.com' || this.locationModuleState() !== 'add') {
      return;
    }

    let data;
    if (typeof event.data === 'string') {
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.warn('Received a non-JSON message:', event.data);
        return;
      }
    } else if (typeof event.data === 'object' && event.data !== null) {
      data = event.data;
    }

    // Heuristic check for address data from the iframe
    if (data && data.address && typeof data.lat === 'number' && typeof data.lng === 'number') {
      this.sucursalForm.patchValue({
        direccion: data.address,
        latitud: data.lat,
        longitud: data.lng,
      });
      this.cdr.detectChanges();
    } else {
        console.warn('Received message from iframe with unexpected format:', data);
    }
  }
}
