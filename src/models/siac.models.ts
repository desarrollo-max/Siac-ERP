
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
  direccion: string;
  latitud: number;
  longitud: number;
  company_id: string;
}

export interface Modulo {
  company_id: string;
  nombre: string;
}

export interface UsuarioParaAdmin extends Usuario {
  empresas: Empresa[];
}
