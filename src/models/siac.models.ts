
export interface Usuario {
  id: string;
  email: string;
}

export interface Empresa {
  id: string;
  nombre: string;
  root_admin_id: string;
}

export interface EmpresaUsuario {
  user_id: string;
  company_id: string;
}

export interface Sucursal {
  id: number;
  nombre: string;
  tipo: 'POS' | 'Warehouse' | 'Office';
  company_id: string;
}

export interface ArticuloInventario {
  id: number;
  nombre: string;
  sku: string;
  stock: number;
  company_id: string;
  custom_fields: { [key: string]: any };
}

export interface CampoDefinicion {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean';
  required: boolean;
}

export interface ConfiguracionCatalogo {
  id: number;
  company_id: string;
  nombre_catalogo: string;
  fields_definition: CampoDefinicion[];
}

export interface Modulo {
  company_id: string;
  nombre: string;
}

export interface UsuarioParaAdmin extends Usuario {
  empresas: Empresa[];
}
