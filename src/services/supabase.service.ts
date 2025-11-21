import { Injectable, signal } from '@angular/core';
import { Observable, of, delay, tap, map } from 'rxjs';
import { Usuario, Empresa, EmpresaUsuario, Sucursal, Modulo, UsuarioParaAdmin, AvailableModule, Producto, StockInventario } from '../models/siac.models';

// SIMULACIÓN DE LA BASE DE DATOS SUPABASE
const MOCK_USUARIOS: Usuario[] = [
  { id: 'user-123', email: 'admin.root@siac.com' },
];

let MOCK_EMPRESAS: Empresa[] = [];

let MOCK_EMPRESA_USUARIOS: EmpresaUsuario[] = [];

let MOCK_SUCURSALES: Sucursal[] = [];

let MOCK_MODULOS: Modulo[] = [];
let nextModuloId = 1;

let MOCK_PRODUCTOS: Producto[] = [];
let nextProductoId = 1;

let MOCK_STOCK_INVENTARIO: StockInventario[] = [];


const MOCK_AVAILABLE_MODULES: AvailableModule[] = [
    { name: 'Contabilidad', category: 'FINANZAS' },
    { name: 'Facturación', category: 'FINANZAS' },
    { name: 'Gastos', category: 'FINANZAS' },
    { name: 'Hoja de cálculo (BI)', category: 'FINANZAS' },
    { name: 'Documentos', category: 'FINANZAS' },
    { name: 'Firma electrónica', category: 'FINANZAS' },
    { name: 'CRM', category: 'VENTAS' },
    { name: 'Ventas', category: 'VENTAS' },
    { name: 'PdV para tiendas', category: 'VENTAS' },
    { name: 'PdV para restaurantes', category: 'VENTAS' },
    { name: 'Suscripciones', category: 'VENTAS' },
    { name: 'Alquiler', category: 'VENTAS' },
    { name: 'Creador de sitios web', category: 'SITIOS WEB' },
    { name: 'Comercio electrónico', category: 'SITIOS WEB' },
    { name: 'Blog', category: 'SITIOS WEB' },
    { name: 'Foro', category: 'SITIOS WEB' },
    { name: 'Chat en vivo', category: 'SITIOS WEB' },
    { name: 'eLearning', category: 'SITIOS WEB' },
    { name: 'Ubicaciones Físicas', category: 'CADENA DE SUMINISTRO' },
    { name: 'Inventario', category: 'CADENA DE SUMINISTRO' },
    { name: 'Manufactura', category: 'CADENA DE SUMINISTRO' },
    { name: 'PLM', category: 'CADENA DE SUMINISTRO' },
    { name: 'Compras', category: 'CADENA DE SUMINISTRO' },
    { name: 'Mantenimiento', category: 'CADENA DE SUMINISTRO' },
    { name: 'Calidad', category: 'CADENA DE SUMINISTRO' },
    { name: 'Empleados', category: 'RECURSOS HUMANOS' },
    { name: 'Reclutamiento', category: 'RECURSOS HUMANOS' },
    { name: 'Vacaciones', category: 'RECURSOS HUMANOS' },
    { name: 'Evaluaciones', category: 'RECURSOS HUMANOS' },
    { name: 'Referencias', category: 'RECURSOS HUMANOS' },
    { name: 'Flotilla', category: 'RECURSOS HUMANOS' },
    { name: 'Redes sociales', category: 'MARKETING' },
    { name: 'Marketing por correo', category: 'MARKETING' },
    { name: 'Marketing por SMS', category: 'MARKETING' },
    { name: 'Eventos', category: 'MARKETING' },
    { name: 'Automatización de marketing', category: 'MARKETING' },
    { name: 'Encuestas', category: 'MARKETING' },
    { name: 'Proyectos', category: 'SERVICIOS' },
    { name: 'Registro de horas', category: 'SERVICIOS' },
    { name: 'Servicio externo', category: 'SERVICIOS' },
    { name: 'Soporte al cliente', category: 'SERVICIOS' },
    { name: 'Planeación', category: 'SERVICIOS' },
    { name: 'Citas', category: 'SERVICIOS' },
    { name: 'Conversaciones', category: 'PRODUCTIVIDAD' },
    { name: 'Aprobaciones', category: 'PRODUCTIVIDAD' },
    { name: 'IoT', category: 'PRODUCTIVIDAD' },
    { name: 'VoIP', category: 'PRODUCTIVIDAD' },
    { name: 'Artículos', category: 'PRODUCTIVIDAD' },
    { name: 'WhatsApp', category: 'PRODUCTIVIDAD' },
];


@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private currentUser = signal<Usuario | null>(null);
  
  auth = {
    getUser: () => {
      this.currentUser.set(MOCK_USUARIOS[0]);
      return of({ data: { user: this.currentUser() }, error: null });
    }
  };

  private from<T>(table: string) {
    const getUserId = () => this.currentUser()?.id;
    
    const getVisibleCompanyIds = (): string[] => {
      const userId = getUserId();
      if (!userId) return [];
      return MOCK_EMPRESA_USUARIOS
        .filter(cu => cu.user_id === userId)
        .map(cu => cu.company_id);
    };

    return {
      select: (columns: string = '*') => {
        const visibleCompanyIds = getVisibleCompanyIds();
        let data: any[] = [];

        switch(table) {
            case 'companies':
                data = MOCK_EMPRESAS.filter(c => visibleCompanyIds.includes(c.id));
                break;
            case 'branches':
                data = MOCK_SUCURSALES;
                break;
            case 'modules':
                data = MOCK_MODULOS;
                break;
            case 'users':
                // For user management, we assume root admin can see all users
                data = MOCK_USUARIOS;
                break;
            case 'products':
                data = MOCK_PRODUCTOS;
                break;
            case 'stock':
                data = MOCK_STOCK_INVENTARIO;
                break;
        }

        return {
          in: (column: string, values: any[]) => {
             if (column === 'id' && table === 'companies') {
                return of({ data: data, error: null }).pipe(delay(300));
             }
             if (column === 'company_id') {
                 const filteredData = data.filter(item => values.includes(item.company_id));
                 return of({ data: filteredData, error: null }).pipe(delay(300));
             }
             return of({ data: [], error: null });
          },
          eq: (column: string, value: any) => {
             const rlsFilteredData = data.filter(item => 'company_id' in item ? visibleCompanyIds.includes(item.company_id) : true);
             const finalData = rlsFilteredData.filter(item => item[column] === value);
             return of({ data: finalData, error: null }).pipe(delay(300));
          },
          all: () => {
            return of({ data: data, error: null }).pipe(delay(300));
          }
        };
      },
      insert: (records: any | any[]) => {
        const newRecords = Array.isArray(records) ? records : [records];
        switch(table) {
            case 'branches':
                MOCK_SUCURSALES.push(...newRecords);
                break;
            case 'products':
                MOCK_PRODUCTOS.push(...newRecords);
                break;
        }
        return of({ data: newRecords, error: null }).pipe(delay(400));
      }
    };
  }

  // Métodos de API Pública del servicio

  getEmpresasUsuario(): Observable<Empresa[]> {
    return this.from<Empresa>('companies').select('*').in('id', []).pipe(map(response => response.data));
  }
  
  getModulos(): Observable<Modulo[]> {
    return this.from<Modulo>('modules').select('*').all().pipe(map(response => response.data));
  }

  getTodosLosUsuariosConEmpresas(): Observable<UsuarioParaAdmin[]> {
    const usuarios = MOCK_USUARIOS;
    const empresasUsuario = MOCK_EMPRESA_USUARIOS;
    const empresas = MOCK_EMPRESAS;

    const data: UsuarioParaAdmin[] = usuarios.map(user => {
        const companyIds = empresasUsuario.filter(eu => eu.user_id === user.id).map(eu => eu.company_id);
        const userEmpresas = empresas.filter(e => companyIds.includes(e.id));
        return {
            ...user,
            empresas: userEmpresas
        };
    });

    return of(data).pipe(delay(500));
  }
  
  updateUserCompanyAccess(userId: string, companyIds: string[]): Observable<void> {
    MOCK_EMPRESA_USUARIOS = MOCK_EMPRESA_USUARIOS.filter(eu => eu.user_id !== userId);
    
    const newAssignments: EmpresaUsuario[] = companyIds.map(companyId => ({
        user_id: userId,
        company_id: companyId,
    }));
    MOCK_EMPRESA_USUARIOS.push(...newAssignments);

    return of(undefined).pipe(delay(600));
  }

  getSucursales(companyId: string): Observable<Sucursal[]> {
    return this.from<Sucursal>('branches').select('*').eq('company_id', companyId).pipe(map(response => response.data));
  }
  
  addSucursal(sucursal: Omit<Sucursal, 'id'>): Observable<Sucursal> {
    const nuevaSucursal = { ...sucursal, id: Date.now() };
    return this.from<Sucursal>('branches').insert(nuevaSucursal).pipe(map(res => res.data[0]));
  }

  updateSucursal(sucursal: Sucursal): Observable<Sucursal> {
    const index = MOCK_SUCURSALES.findIndex(s => s.id === sucursal.id);
    if (index !== -1) {
        MOCK_SUCURSALES[index] = sucursal;
    }
    return of(sucursal).pipe(delay(400));
  }

  deleteSucursal(sucursalId: number): Observable<void> {
    MOCK_SUCURSALES = MOCK_SUCURSALES.filter(s => s.id !== sucursalId);
    return of(undefined).pipe(delay(400));
  }

  addEmpresa(empresa: Omit<Empresa, 'id' | 'root_admin_id' | 'logo_url' | 'logo_icon_url'>): Observable<Empresa> {
    const rootAdminId = this.currentUser()?.id;
    if (!rootAdminId) {
      return new Observable(observer => observer.error('No authenticated user'));
    }

    const nuevoId = `${empresa.nombre.toLowerCase().replace(/\s+/g, '-')}-id`;
    const nuevaEmpresa: Empresa = {
      ...empresa,
      id: nuevoId,
      root_admin_id: rootAdminId,
      logo_url: 'https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/logo.png',
      logo_icon_url: 'https://bupapjirkilnfoswgtsg.supabase.co/storage/v1/object/public/assets/icono.png'
    };
    MOCK_EMPRESAS.push(nuevaEmpresa);

    const newAssignment: EmpresaUsuario = {
        user_id: rootAdminId,
        company_id: nuevoId,
    };
    MOCK_EMPRESA_USUARIOS.push(newAssignment);

    return of(nuevaEmpresa).pipe(delay(500));
  }
  
  updateEmpresa(empresa: Partial<Empresa> & { id: string }): Observable<Empresa> {
      const index = MOCK_EMPRESAS.findIndex(e => e.id === empresa.id);
      if (index > -1) {
          MOCK_EMPRESAS[index] = { ...MOCK_EMPRESAS[index], ...empresa };
          return of(MOCK_EMPRESAS[index]).pipe(delay(400));
      }
      return new Observable(observer => observer.error('Empresa not found'));
  }

  getAvailableModules(): Observable<AvailableModule[]> {
      return of(MOCK_AVAILABLE_MODULES).pipe(delay(400));
  }

  installModule(companyId: string, moduleName: string): Observable<Modulo> {
      const newModule: Modulo = {
          id: nextModuloId++,
          company_id: companyId,
          nombre: moduleName,
      };
      MOCK_MODULOS.push(newModule);
      return of(newModule).pipe(delay(600));
  }

  // INVENTORY MODULE METHODS
  getProductos(companyId: string): Observable<Producto[]> {
    return this.from<Producto>('products').select('*').eq('company_id', companyId).pipe(map(res => res.data));
  }

  addProducto(productoData: Omit<Producto, 'id'>): Observable<Producto> {
    const newProducto: Producto = { ...productoData, id: nextProductoId++ };
    MOCK_PRODUCTOS.push(newProducto);
    // Initialize stock at 0 for all locations
    MOCK_SUCURSALES.filter(s => s.company_id === productoData.company_id).forEach(sucursal => {
      const stockExists = MOCK_STOCK_INVENTARIO.some(s => s.product_id === newProducto.id && s.sucursal_id === sucursal.id);
      if (!stockExists) {
        MOCK_STOCK_INVENTARIO.push({ product_id: newProducto.id, sucursal_id: sucursal.id, cantidad: 0 });
      }
    });
    return of(newProducto).pipe(delay(400));
  }

  updateProducto(producto: Producto): Observable<Producto> {
    const index = MOCK_PRODUCTOS.findIndex(p => p.id === producto.id);
    if (index > -1) {
      MOCK_PRODUCTOS[index] = producto;
      return of(producto).pipe(delay(400));
    }
    return new Observable(o => o.error('Producto no encontrado'));
  }

  deleteProducto(productoId: number): Observable<void> {
    MOCK_PRODUCTOS = MOCK_PRODUCTOS.filter(p => p.id !== productoId);
    MOCK_STOCK_INVENTARIO = MOCK_STOCK_INVENTARIO.filter(s => s.product_id !== productoId);
    return of(undefined).pipe(delay(400));
  }

  importarProductos(productos: Omit<Producto, 'id'>[]): Observable<Producto[]> {
      const nuevosProductos: Producto[] = [];
      productos.forEach(pData => {
          const newProducto: Producto = { ...pData, id: nextProductoId++ };
          MOCK_PRODUCTOS.push(newProducto);
          nuevosProductos.push(newProducto);
          MOCK_SUCURSALES.filter(s => s.company_id === pData.company_id).forEach(sucursal => {
             MOCK_STOCK_INVENTARIO.push({ product_id: newProducto.id, sucursal_id: sucursal.id, cantidad: 0 });
          });
      });
      return of(nuevosProductos).pipe(delay(800));
  }

  getStockPorCompania(companyId: string): Observable<StockInventario[]> {
    const companySucursalIds = MOCK_SUCURSALES.filter(s => s.company_id === companyId).map(s => s.id);
    const stockData = MOCK_STOCK_INVENTARIO.filter(s => companySucursalIds.includes(s.sucursal_id));
    return of(stockData).pipe(delay(300));
  }

  updateStock(productId: number, sucursalId: number, cantidad: number): Observable<StockInventario> {
      let stockItem = MOCK_STOCK_INVENTARIO.find(s => s.product_id === productId && s.sucursal_id === sucursalId);
      if (stockItem) {
          stockItem.cantidad = cantidad;
      } else {
          stockItem = { product_id: productId, sucursal_id: sucursalId, cantidad };
          MOCK_STOCK_INVENTARIO.push(stockItem);
      }
      return of(stockItem).pipe(delay(200));
  }
}
