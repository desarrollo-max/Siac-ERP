import { Component, OnInit, ChangeDetectionStrategy, signal, effect, computed, ChangeDetectorRef, inject, OnDestroy, ViewChild, ElementRef, Injector, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, FormControl, FormArray } from '@angular/forms';
import { SupabaseService } from './services/supabase.service';
import { Empresa, Sucursal, Modulo, UsuarioParaAdmin, AvailableModule, Producto, StockInventario } from './models/siac.models';

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
  @ViewChild('addressInput') addressInput: ElementRef<HTMLInputElement>;
  @ViewChild('csvImportInput') csvImportInput: ElementRef<HTMLInputElement>;

  private supabase = inject(SupabaseService);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(Injector);

  // --- View State ---
  activeView = signal<AppView>('launcher');

  // --- Data Signals ---
  empresas = signal<Empresa[]>([]);
  modulos = signal<Modulo[]>([]);
  usuariosParaAdmin = signal<UsuarioParaAdmin[]>([]);
  activeCompanyId = signal<string | null>(null);
  
  // --- UI State Signals ---
  isLoading = signal<boolean>(true);
  isSubmitting = signal<boolean>(false);
  isSidebarCollapsed = signal<boolean>(false);
  
  // --- Computed Signals ---
  activeCompany = computed(() => this.empresas().find(e => e.id === this.activeCompanyId()));
  activeCompanyLogo = computed(() => this.activeCompany()?.logo_url || 'https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logo.png');
  activeCompanyIcon = computed(() => this.activeCompany()?.logo_icon_url || 'https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/icono.png');

  isLocationsModuleInstalled = computed(() => this.modulos().some(m => m.company_id === this.activeCompanyId() && m.nombre === 'Ubicaciones Físicas'));
  isInventoryModuleInstalled = computed(() => this.modulos().some(m => m.company_id === this.activeCompanyId() && m.nombre === 'Inventario'));
  
  // --- ACL Editing State ---
  editingUser = signal<UsuarioParaAdmin | null>(null);
  editedUserAccess = signal<Map<string, boolean>>(new Map());

  // --- Business Creation/Editing State ---
  isCreatingBusiness = signal<boolean>(false);
  isEditingBusiness = signal<boolean>(false);
  isLogoPickerOpen = signal<boolean>(false);
  editEmpresaForm: FormGroup;
  empresaForm: FormGroup;
  availableLogos = signal<string[]>([
    "https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logos/logo-1.png",
    "https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logos/logo-2.png",
    "https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logos/logo-3.png",
    "https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logos/logo-4.png",
    "https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logos/logo-5.png",
    "https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logos/logo-6.png",
    "https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logos/logo-7.png",
    "https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logos/logo-8.png",
  ]);

  // --- Location Module State ---
  sucursales = signal<Sucursal[]>([]);
  locationModuleState = signal<LocationModuleState>('view');
  editingSucursal = signal<Sucursal | null>(null);
  sucursalForm: FormGroup;
  mapsApiStatus = signal<'loading' | 'ready' | 'error'>('loading');
  private autocomplete: any = null;

  // --- Inventory Module State ---
  productos = signal<Producto[]>([]);
  stock = signal<StockInventario[]>([]);
  activeInventoryTab = signal<'products' | 'stock'>('products');
  productoModalState = signal<'closed' | 'add' | 'edit'>('closed');
  editingProducto = signal<Producto | null>(null);
  productoForm: FormGroup;
  isImportModalOpen = signal(false);
  editingStock = signal<StockInventario & { productName: string; sucursalName: string } | null>(null);
  stockForm: FormGroup;

  // --- Module Installer State ---
  isModuleInstallerOpen = signal(false);
  installingForCompany = signal<Empresa | null>(null);
  availableModules = signal<AvailableModule[]>([]);
  isInstallingModule = signal<string | null>(null);
  moduleCategoryColors: { [key: string]: string } = {
    'FINANZAS': 'text-teal-600 dark:text-teal-400',
    'VENTAS': 'text-red-600 dark:text-red-400',
    'SITIOS WEB': 'text-sky-600 dark:text-sky-400',
    'CADENA DE SUMINISTRO': 'text-purple-600 dark:text-purple-400',
    'RECURSOS HUMANOS': 'text-indigo-600 dark:text-indigo-400',
    'MARKETING': 'text-orange-600 dark:text-orange-400',
    'SERVICIOS': 'text-amber-600 dark:text-amber-400',
    'PRODUCTIVIDAD': 'text-rose-600 dark:text-rose-400',
  };

  availableModulesByCategory = computed(() => {
    const grouped: { [key: string]: AvailableModule[] } = {};
    for (const mod of this.availableModules()) {
        if (!grouped[mod.category]) {
            grouped[mod.category] = [];
        }
        grouped[mod.category].push(mod);
    }
    return Object.entries(grouped);
  });

  stockWithDetails = computed(() => {
    const prods = this.productos();
    const sucs = this.sucursales();
    return this.stock().map(s => {
      const product = prods.find(p => p.id === s.product_id);
      const sucursal = sucs.find(suc => suc.id === s.sucursal_id);
      return {
        ...s,
        productName: product?.nombre || 'Producto no encontrado',
        productSku: product?.sku || 'N/A',
        sucursalName: sucursal?.nombre || 'Ubicación no encontrada'
      }
    });
  });


  constructor() {
    this.buildForms();
    window.addEventListener('google-maps-auth-error', this.handleMapsAuthError);

    effect(() => {
      const companyId = this.activeCompanyId();
      if (companyId) {
        this.loadCompanyData(companyId);
      }
    });

    effect(() => {
      const state = this.locationModuleState();
      if ((state === 'add' || state === 'edit') && this.isLocationsModuleInstalled()) {
        afterNextRender(() => this.initAutocomplete(), { injector: this.injector });
      } else {
        this.destroyAutocomplete();
      }
    });
  }

  private buildForms(): void {
    this.sucursalForm = new FormGroup({
      id: new FormControl(null),
      nombre: new FormControl('', Validators.required),
      direccion: new FormControl('', Validators.required),
      latitud: new FormControl({ value: 0, disabled: true }, [Validators.required, Validators.min(-90), Validators.max(90)]),
      longitud: new FormControl({ value: 0, disabled: true }, [Validators.required, Validators.min(-180), Validators.max(180)]),
    });
    
    this.empresaForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
    });

    this.editEmpresaForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
      logo_url: new FormControl(''),
    });

    this.productoForm = new FormGroup({
      id: new FormControl(null),
      nombre: new FormControl('', Validators.required),
      sku: new FormControl('', Validators.required),
      descripcion: new FormControl(''),
      custom_fields: new FormArray([])
    });

    this.stockForm = new FormGroup({
        cantidad: new FormControl(0, [Validators.required, Validators.min(0)])
    });
  }

  ngOnInit(): void {
    this.initializeApp();
  }
  
  ngOnDestroy(): void {
    window.removeEventListener('google-maps-auth-error', this.handleMapsAuthError);
    this.destroyAutocomplete();
  }

  private handleMapsAuthError = () => this.mapsApiStatus.set('error');

  private initAutocomplete(): void {
    if (this.mapsApiStatus() === 'error' || !this.addressInput?.nativeElement || this.autocomplete) return;
    if (typeof google === 'undefined' || !google.maps?.places) {
      this.mapsApiStatus.set('loading');
      setTimeout(() => this.initAutocomplete(), 200);
      return;
    }
    this.mapsApiStatus.set('ready');
    this.autocomplete = new google.maps.places.Autocomplete(this.addressInput.nativeElement, {
      types: ['address'],
      fields: ['formatted_address', 'geometry.location']
    });
    this.autocomplete.addListener('place_changed', () => {
      const place = this.autocomplete.getPlace();
      if (place.geometry?.location) {
        this.sucursalForm.patchValue({
          direccion: this.addressInput.nativeElement.value,
          latitud: place.geometry.location.lat(),
          longitud: place.geometry.location.lng(),
        });
        this.cdr.markForCheck();
      }
    });
  }

  private destroyAutocomplete(): void {
    if (this.autocomplete) {
      google.maps.event.clearInstanceListeners(this.autocomplete);
      document.querySelectorAll('.pac-container').forEach(c => c.remove());
      this.autocomplete = null;
    }
  }

  private initializeApp(): void {
    this.isLoading.set(true);
    this.supabase.auth.getUser().subscribe(() => {
      this.supabase.getEmpresasUsuario().subscribe(empresas => this.empresas.set(empresas));
      this.supabase.getModulos().subscribe(modulos => this.modulos.set(modulos));
      this.supabase.getTodosLosUsuariosConEmpresas().subscribe(usuarios => this.usuariosParaAdmin.set(usuarios));
      this.supabase.getAvailableModules().subscribe(modules => {
        this.availableModules.set(modules);
        this.isLoading.set(false);
      });
    });
  }
  
  private loadCompanyData(companyId: string): void {
    this.isLoading.set(true);
    this.sucursales.set([]);
    this.productos.set([]);
    this.stock.set([]);
    this.supabase.getSucursales(companyId).subscribe(data => this.sucursales.set(data));
    this.supabase.getProductos(companyId).subscribe(data => this.productos.set(data));
    this.supabase.getStockPorCompania(companyId).subscribe(data => {
        this.stock.set(data);
        this.isLoading.set(false);
    });
  }

  getModulesForCompany(companyId: string): Modulo[] {
    return this.modulos().filter(m => m.company_id === companyId);
  }
  
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

  // --- Location Module CRUD ---
  startAddingSucursal(): void {
    this.sucursalForm.reset({ nombre: '', direccion: '', latitud: 0, longitud: 0 });
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
    const sucursalData = { ...this.sucursalForm.getRawValue(), company_id: this.activeCompanyId()! };
    if (this.editingSucursal()) {
        this.supabase.updateSucursal(sucursalData).subscribe(updated => {
            this.sucursales.update(list => list.map(s => s.id === updated.id ? updated : s));
            this.isSubmitting.set(false);
            this.cancelEditOrAdd();
        });
    } else {
        const { id, ...newData } = sucursalData;
        this.supabase.addSucursal(newData).subscribe(sucursal => {
            this.sucursales.update(list => [...list, sucursal]);
            this.isSubmitting.set(false);
            this.cancelEditOrAdd();
        });
    }
  }

  eliminarSucursal(sucursalId: number): void {
    if (confirm('¿Está seguro?')) {
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
    this.empresas().forEach(e => accessMap.set(e.id, userCompanyIds.has(e.id)));
    this.editedUserAccess.set(accessMap);
  }

  closeAccessEditor(): void { this.editingUser.set(null); }

  updateEditedAccess(companyId: string, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.editedUserAccess.update(map => new Map(map.set(companyId, isChecked)));
  }

  saveUserAccess(): void {
    const user = this.editingUser();
    if (!user) return;
    this.isSubmitting.set(true);
    const selectedCompanyIds = Array.from(this.editedUserAccess().entries()).filter(([, v]) => v).map(([k]) => k);
    this.supabase.updateUserCompanyAccess(user.id, selectedCompanyIds).subscribe(() => {
      this.supabase.getTodosLosUsuariosConEmpresas().subscribe(usuarios => {
          this.usuariosParaAdmin.set(usuarios);
          this.isSubmitting.set(false);
          this.closeAccessEditor();
      });
    });
  }

  // --- Business Creation/Editing ---
  openCreateBusinessModal(): void {
    this.empresaForm.reset();
    this.isCreatingBusiness.set(true);
  }
  closeCreateBusinessModal(): void { this.isCreatingBusiness.set(false); }
  
  openEditBusinessModal(): void {
    const company = this.activeCompany();
    if (company) {
      this.editEmpresaForm.patchValue(company);
      this.isEditingBusiness.set(true);
    }
  }
  closeEditBusinessModal(): void {
    this.isEditingBusiness.set(false);
    this.closeLogoPicker();
  }

  crearEmpresa(): void {
    if (this.empresaForm.invalid) return;
    this.isSubmitting.set(true);
    this.supabase.addEmpresa({ nombre: this.empresaForm.value.nombre }).subscribe(empresa => {
      this.empresas.update(list => [...list, empresa]);
      this.supabase.getModulos().subscribe(modulos => this.modulos.set(modulos));
      this.isSubmitting.set(false);
      this.closeCreateBusinessModal();
    });
  }
  
  saveBusinessChanges(): void {
      if (this.editEmpresaForm.invalid || !this.activeCompanyId()) return;
      this.isSubmitting.set(true);
      const updatedData = { id: this.activeCompanyId()!, ...this.editEmpresaForm.value };
      this.supabase.updateEmpresa(updatedData).subscribe(updatedEmpresa => {
          this.empresas.update(list => list.map(e => e.id === updatedEmpresa.id ? updatedEmpresa : e));
          this.isSubmitting.set(false);
          this.closeEditBusinessModal();
      });
  }

  toggleSidebar(): void { this.isSidebarCollapsed.update(v => !v); }

  openLogoPicker(): void { this.isLogoPickerOpen.set(true); }
  closeLogoPicker(): void { this.isLogoPickerOpen.set(false); }
  selectLogo(logoUrl: string): void {
    this.editEmpresaForm.patchValue({ logo_url: logoUrl });
    this.closeLogoPicker();
  }

  // --- Module Installer ---
  openModuleInstaller(company: Empresa): void {
    this.installingForCompany.set(company);
    this.isModuleInstallerOpen.set(true);
  }
  closeModuleInstaller(): void {
    this.isModuleInstallerOpen.set(false);
    this.installingForCompany.set(null);
  }
  isModuleInstalled(moduleName: string): boolean {
    const company = this.installingForCompany();
    if (!company) return this.modulos().some(m => m.company_id === this.activeCompanyId() && m.nombre === moduleName);
    return this.modulos().some(m => m.company_id === company.id && m.nombre === moduleName);
  }
  installModule(moduleName: string): void {
    const company = this.installingForCompany();
    if (!company || this.isModuleInstalled(moduleName)) return;
    this.isInstallingModule.set(moduleName);
    this.supabase.installModule(company.id, moduleName).subscribe(newModule => {
      this.modulos.update(list => [...list, newModule]);
      this.isInstallingModule.set(null);
    });
  }

  // --- Inventory Module Methods ---
  get customFields(): FormArray { return this.productoForm.get('custom_fields') as FormArray; }
  addCustomField(key = '', value = ''): void {
    this.customFields.push(new FormGroup({
      key: new FormControl(key, Validators.required),
      value: new FormControl(value, Validators.required)
    }));
  }
  removeCustomField(index: number): void { this.customFields.removeAt(index); }

  startAddingProducto(): void {
    this.editingProducto.set(null);
    this.productoForm.reset({ nombre: '', sku: '', descripcion: '' });
    this.customFields.clear();
    this.productoModalState.set('add');
  }
  startEditingProducto(producto: Producto): void {
    this.editingProducto.set(producto);
    this.productoForm.patchValue(producto);
    this.customFields.clear();
    Object.entries(producto.custom_fields || {}).forEach(([key, value]) => this.addCustomField(key, value));
    this.productoModalState.set('edit');
  }
  closeProductoModal(): void {
    this.editingProducto.set(null);
    this.productoModalState.set('closed');
  }

  saveProducto(): void {
    if (this.productoForm.invalid || !this.activeCompanyId()) return;
    this.isSubmitting.set(true);
    const formVal = this.productoForm.value;
    const custom_fields = formVal.custom_fields.reduce((acc: any, curr: any) => {
      if (curr.key) acc[curr.key] = curr.value;
      return acc;
    }, {});
    const productoData = { ...formVal, custom_fields, company_id: this.activeCompanyId()! };

    if (this.editingProducto()) {
      this.supabase.updateProducto(productoData).subscribe(updated => {
        this.productos.update(list => list.map(p => p.id === updated.id ? updated : p));
        this.finishSubmittingProducto();
      });
    } else {
      const { id, ...newData } = productoData;
      this.supabase.addProducto(newData).subscribe(nuevo => {
        this.productos.update(list => [...list, nuevo]);
        this.supabase.getStockPorCompania(this.activeCompanyId()!).subscribe(stock => this.stock.set(stock));
        this.finishSubmittingProducto();
      });
    }
  }
  private finishSubmittingProducto(): void {
    this.isSubmitting.set(false);
    this.closeProductoModal();
  }
  deleteProducto(productoId: number): void {
    if (confirm('¿Está seguro de eliminar este producto?')) {
      this.supabase.deleteProducto(productoId).subscribe(() => {
        this.productos.update(list => list.filter(p => p.id !== productoId));
      });
    }
  }

  openImportModal(): void { this.isImportModalOpen.set(true); }
  closeImportModal(): void { this.isImportModalOpen.set(false); }
  importProductosDesdeCSV(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.activeCompanyId()) return;
    this.isSubmitting.set(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const headers = lines.shift()?.split(',').map(h => h.trim()) || [];
      const productos: Omit<Producto, 'id'>[] = lines.map(line => {
        const values = line.split(',');
        const p: any = { company_id: this.activeCompanyId()!, custom_fields: {} };
        headers.forEach((header, i) => {
          const value = values[i]?.trim() || '';
          if (header === 'nombre' || header === 'sku' || header === 'descripcion') {
            p[header] = value;
          } else {
            p.custom_fields[header] = value;
          }
        });
        return p;
      });
      this.supabase.importarProductos(productos).subscribe(nuevos => {
        this.productos.update(list => [...list, ...nuevos]);
        this.isSubmitting.set(false);
        this.closeImportModal();
        if(this.csvImportInput) this.csvImportInput.nativeElement.value = '';
      });
    };
    reader.readAsText(file);
  }

  startEditingStock(stockItem: StockInventario & { productName: string; sucursalName: string }): void {
    this.editingStock.set(stockItem);
    this.stockForm.patchValue({ cantidad: stockItem.cantidad });
  }
  closeStockModal(): void { this.editingStock.set(null); }
  saveStock(): void {
    if (this.stockForm.invalid || !this.editingStock()) return;
    this.isSubmitting.set(true);
    const { product_id, sucursal_id } = this.editingStock()!;
    const cantidad = this.stockForm.value.cantidad;
    this.supabase.updateStock(product_id, sucursal_id, cantidad).subscribe(updated => {
      this.stock.update(list => list.map(s => (s.product_id === updated.product_id && s.sucursal_id === updated.sucursal_id) ? updated : s));
      this.isSubmitting.set(false);
      this.closeStockModal();
    });
  }
}
