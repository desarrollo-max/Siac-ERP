
export interface Usuario {
  id: string;
  email: string;
}

export interface Empresa {
  id: string;
  nombre: string;
  root_admin_id: string;
  logo_url?: string;
  logo_icon_url?: string;
}

export interface EmpresaUsuario {
  user_id: string;
  company_id: string;
}

export interface Sucursal {
  id: number;
  nombre: string;
  direccion: string;
  latitud: number;
  longitud: number;
  company_id: string;
}

export interface Modulo {
  id: number;
  company_id: string;
  nombre: string;
}

export interface UsuarioParaAdmin extends Usuario {
  empresas: Empresa[];
}

export interface AvailableModule {
  name: string;
  category: string;
}

export interface Producto {
  id: number;
  company_id: string;
  nombre: string;
  sku: string;
  descripcion: string;
  custom_fields: { [key: string]: any };
}

export interface StockInventario {
  product_id: number;
  sucursal_id: number;
  cantidad: number;
}
