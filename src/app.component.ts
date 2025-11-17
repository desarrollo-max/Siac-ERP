import { Component, OnInit, ChangeDetectionStrategy, signal, effect, computed, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Removed FormBuilder as it was causing type errors. Forms are now created directly with FormGroup and FormControl.
import { ReactiveFormsModule, FormGroup, Validators, FormControl } from '@angular/forms';
import { SupabaseService } from './services/supabase.service';
import { Empresa, Sucursal, ArticuloInventario, ConfiguracionCatalogo, CampoDefinicion, Modulo, UsuarioParaAdmin } from './models/siac.models';

type AppView = 'launcher' | 'business_dashboard' | 'user_management';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AppComponent implements OnInit {
  private supabase = inject(SupabaseService);
  // FIX: Removed FormBuilder injection.
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
  articulos = signal<ArticuloInventario[]>([]);
  configuracionCatalogo = signal<ConfiguracionCatalogo | null>(null);
  
  // --- UI State Signals ---
  isLoading = signal<boolean>(true);
  isSubmitting = signal<boolean>(false);
  
  // --- Computed Signals ---
  activeCompany = computed(() => this.empresas().find(e => e.id === this.activeCompanyId()));
  
  // --- Forms ---
  sucursalForm: FormGroup;
  articuloForm: FormGroup;
  empresaForm: FormGroup;

  // --- File Upload State ---
  fileToUpload = signal<File | null>(null);
  uploadStatus = signal<string>('');
  isUploading = signal<boolean>(false);

  // --- ACL Editing State ---
  editingUser = signal<UsuarioParaAdmin | null>(null);
  editedUserAccess = signal<Map<string, boolean>>(new Map());

  // --- Business Creation State ---
  isCreatingBusiness = signal<boolean>(false);

  constructor() {
    // FIX: Replaced FormBuilder.group with new FormGroup and new FormControl to fix TS errors on lines 61, 66, 70, and 73.
    this.sucursalForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
      tipo: new FormControl('POS', Validators.required),
    });

    this.articuloForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
      sku: new FormControl('', Validators.required),
      stock: new FormControl(0, [Validators.required, Validators.min(0)]),
      dynamicForm: new FormGroup({}),
    });
    
    this.empresaForm = new FormGroup({
      nombre: new FormControl('', Validators.required),
    });

    effect(() => {
      const companyId = this.activeCompanyId();
      if (companyId) {
        this.loadCompanyData(companyId);
      }
    });

    effect(() => {
        const config = this.configuracionCatalogo();
        this.buildDynamicForm(config?.fields_definition || []);
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
    this.articulos.set([]);
    this.configuracionCatalogo.set(null);

    this.supabase.getSucursales(companyId).subscribe(data => this.sucursales.set(data));
    this.supabase.getArticulos(companyId).subscribe(data => this.articulos.set(data));
    this.supabase.getConfiguracionCatalogo(companyId).subscribe(data => {
        this.configuracionCatalogo.set(data);
        this.isLoading.set(false);
    });
  }

  private buildDynamicForm(fields: CampoDefinicion[]): void {
    const dynamicFormGroup = this.articuloForm.get('dynamicForm') as FormGroup;
    Object.keys(dynamicFormGroup.controls).forEach(key => {
      dynamicFormGroup.removeControl(key);
    });
    fields.forEach(field => {
      const validators = field.required ? [Validators.required] : [];
      const control = new FormControl(field.type === 'boolean' ? false : '', validators);
      dynamicFormGroup.addControl(field.key, control);
    });
    this.cdr.markForCheck();
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
      this.sucursalForm.reset({ tipo: 'POS' });
      this.isSubmitting.set(false);
    });
  }

  agregarArticulo(): void {
    if (this.articuloForm.invalid || !this.activeCompanyId()) return;
    
    this.isSubmitting.set(true);
    const { dynamicForm, ...staticFields } = this.articuloForm.value;
    const nuevoArticulo = {
        ...staticFields,
        custom_fields: dynamicForm,
        company_id: this.activeCompanyId()!,
    };

    this.supabase.addArticulo(nuevoArticulo).subscribe(articulo => {
        this.articulos.update(list => [...list, articulo]);
        this.articuloForm.reset({ stock: 0 });
        this.isSubmitting.set(false);
    });
  }
  
  // --- File Upload Logic ---
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.fileToUpload.set(input.files[0]);
      this.uploadStatus.set('');
    }
  }

  iniciarProcesoImportacion(): void {
    const file = this.fileToUpload();
    const companyId = this.activeCompanyId();
    const config = this.configuracionCatalogo();

    if (!file || !companyId || !config) {
      this.uploadStatus.set('Error: Falta archivo, empresa o configuración.');
      return;
    }

    this.isUploading.set(true);
    this.uploadStatus.set(`Procesando ${file.name}...`);

    this.supabase.uploadFileAndTriggerFunction(file, companyId, config).subscribe({
      next: (response) => {
        this.uploadStatus.set(response.message);
        this.isUploading.set(false);
        this.fileToUpload.set(null);
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if(fileInput) fileInput.value = '';
      },
      error: (err) => {
        this.uploadStatus.set('Error en el procesamiento.');
        this.isUploading.set(false);
      }
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
      return new Map(map); // Create new map instance to trigger signal change
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
}
