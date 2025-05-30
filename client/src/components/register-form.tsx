import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
// Função para validar CPF
const validaCPF = (cpf: string): boolean => {
  // Remove caracteres não numéricos
  const cleanCPF = cpf.replace(/[^\d]/g, '');
  
  // Verifica se tem 11 dígitos
  if (cleanCPF.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
  
  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF[i]) * (10 - i);
  }
  let firstDigit = (sum * 10) % 11;
  if (firstDigit === 10) firstDigit = 0;
  if (firstDigit !== parseInt(cleanCPF[9])) return false;
  
  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF[i]) * (11 - i);
  }
  let secondDigit = (sum * 10) % 11;
  if (secondDigit === 10) secondDigit = 0;
  if (secondDigit !== parseInt(cleanCPF[10])) return false;
  
  return true;
};

const registerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  username: z.string().min(3, "Nome de usuário deve ter pelo menos 3 caracteres"),
  email: z.string()
    .min(1, "Email é obrigatório")
    .email("Email inválido"),
  cpf: z.string()
    .min(1, "CPF é obrigatório")
    .refine((cpf) => validaCPF(cpf), "CPF inválido"),
  password: z.string()
    .min(8, "Senha deve ter pelo menos 8 caracteres")
    .refine((password) => /[A-Z]/.test(password), "Senha deve conter pelo menos 1 letra maiúscula")
    .refine((password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), "Senha deve conter pelo menos 1 caractere especial"),
  confirmPassword: z.string().min(1, "Confirme sua senha"),
  terms: z.boolean().refine(val => val === true, {
    message: "Você deve aceitar os termos para continuar",
  }),
}).refine(data => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const { registerMutation } = useAuth();
  const [_, navigate] = useLocation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      cpf: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    registerMutation.mutate(
      {
        name: data.name,
        username: data.username,
        email: data.email,
        cpf: data.cpf,
        password: data.password,
      },
      {
        onSuccess: () => {
          navigate("/");
        },
      }
    );
  };

  // Função para verificar se a senha atende aos requisitos
  const getPasswordValidation = (password: string) => {
    return {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-gray-800">Criar Conta</h3>
        <p className="text-sm text-gray-500 mt-1">
          Registre-se para começar a apostar
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome completo</FormLabel>
                <FormControl>
                  <Input placeholder="Seu nome" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome de usuário</FormLabel>
                <FormControl>
                  <Input placeholder="Seu usuário" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="seu@email.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cpf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPF</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="000.000.000-00" 
                    {...field}
                    onChange={(e) => {
                      // Aplicar máscara de CPF
                      let value = e.target.value.replace(/[^\d]/g, '');
                      if (value.length <= 11) {
                        value = value.replace(/(\d{3})(\d)/, '$1.$2');
                        value = value.replace(/(\d{3})(\d)/, '$1.$2');
                        value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                      }
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => {
              const validation = getPasswordValidation(passwordValue);
              return (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="******" 
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        setPasswordValue(e.target.value);
                      }}
                    />
                  </FormControl>
                  
                  {/* Indicador visual dos requisitos */}
                  {passwordValue && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg border">
                      <p className="text-xs font-medium text-gray-700 mb-2">Requisitos da senha:</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          {validation.length ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <X className="h-3 w-3 text-red-500" />
                          )}
                          <span className={validation.length ? "text-green-600" : "text-red-500"}>
                            Pelo menos 8 caracteres
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {validation.uppercase ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <X className="h-3 w-3 text-red-500" />
                          )}
                          <span className={validation.uppercase ? "text-green-600" : "text-red-500"}>
                            Pelo menos 1 letra maiúscula
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {validation.special ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <X className="h-3 w-3 text-red-500" />
                          )}
                          <span className={validation.special ? "text-green-600" : "text-red-500"}>
                            Pelo menos 1 caractere especial (!@#$%^&*)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmar senha</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="******" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="terms"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="text-sm text-gray-600">
                    Eu concordo com os{" "}
                    <a href="#" className="text-primary">
                      Termos de Serviço
                    </a>{" "}
                    e{" "}
                    <a href="#" className="text-primary">
                      Política de Privacidade
                    </a>
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cadastrando...
              </>
            ) : (
              "Cadastrar"
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600">
          Já tem uma conta?{" "}
          <button
            type="button"
            className="font-medium text-primary hover:text-primary/80"
            onClick={() => navigate("/auth?tab=login")}
          >
            Faça login
          </button>
        </p>
      </div>
    </div>
  );
}
