import { Injectable, signal } from '@angular/core';
import { Observable, of, delay, tap, map } from 'rxjs';
import { Usuario, Empresa, EmpresaUsuario, Sucursal, Modulo, UsuarioParaAdmin } from '../models/siac.models';

// SIMULACIÓN DE LA BASE DE DATOS SUPABASE
const MOCK_USUARIOS: Usuario[] = [
  { id: 'user-123', email: 'admin.root@siac.com' },
];

let MOCK_EMPRESAS: Empresa[] = [];

let MOCK_EMPRESA_USUARIOS: EmpresaUsuario[] = [];

let MOCK_SUCURSALES: Sucursal[] = [];

let MOCK_MODULOS: Modulo[] = [];
let nextModuloId = 1;

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
             if (column === 'company_id') {
                 const rlsFilteredData = data.filter(item => visibleCompanyIds.includes(item.company_id));
                 const finalData = rlsFilteredData.filter(item => item[column] === value);
                 return of({ data: finalData, error: null }).pipe(delay(300));
             }
             return of({ data: [], error: null });
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
    // 1. Remove all old assignments for this user
    MOCK_EMPRESA_USUARIOS = MOCK_EMPRESA_USUARIOS.filter(eu => eu.user_id !== userId);
    
    // 2. Add new assignments
    const newAssignments: EmpresaUsuario[] = companyIds.map(companyId => ({
        user_id: userId,
        company_id: companyId,
    }));
    MOCK_EMPRESA_USUARIOS.push(...newAssignments);

    return of(undefined).pipe(delay(600)); // Simulate network latency
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

    // Grant access to the creator
    const newAssignment: EmpresaUsuario = {
        user_id: rootAdminId,
        company_id: nuevoId,
    };
    MOCK_EMPRESA_USUARIOS.push(newAssignment);

    // Simulate adding default modules for a new company
    MOCK_MODULOS.push({ id: nextModuloId++, company_id: nuevoId, nombre: 'Ubicaciones Físicas' });

    return of(nuevaEmpresa).pipe(delay(500));
  }
  
  updateEmpresa(empresa: Pick<Empresa, 'id' | 'nombre' | 'logo_url' | 'logo_icon_url'>): Observable<Empresa> {
      const index = MOCK_EMPRESAS.findIndex(e => e.id === empresa.id);
      if (index > -1) {
          MOCK_EMPRESAS[index] = { ...MOCK_EMPRESAS[index], ...empresa };
          return of(MOCK_EMPRESAS[index]).pipe(delay(400));
      }
      return new Observable(observer => observer.error('Empresa not found'));
  }
}