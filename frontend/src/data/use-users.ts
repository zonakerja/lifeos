import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi, type UserInput } from "@/lib/api/endpoints";
import { queryKeys } from "@/data/query-keys";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";

export function useUsers() {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
    enabled: isAdminRole(role),
  });
}

export function useUserMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.users });
  return {
    create: useMutation({ mutationFn: (input: UserInput) => usersApi.create(input), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: Partial<UserInput> }) => usersApi.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => usersApi.remove(id), onSuccess: invalidate }),
  };
}
