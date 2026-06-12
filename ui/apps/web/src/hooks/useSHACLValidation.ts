import { createSPARQLClient } from '@rdf-explorer/api-client';
import type { SHACLValidationRequest } from '@rdf-explorer/types';
import { useMutation } from '@tanstack/react-query';

interface UseSHACLValidationOptions {
  onSuccess?: (data: string, executionDuration: number, resultLength: number) => void;
  onError?: (error: { message: string; detail?: string }) => void;
}

export const useSHACLValidation = (options: UseSHACLValidationOptions = {}) => {
  const client = createSPARQLClient();

  const mutation = useMutation({
    mutationFn: async (request: SHACLValidationRequest) => {
      const startTime = performance.now();
      const response = await client.validateSHACL(request);
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000; // Convert to seconds

      return {
        result: response.result,
        length: response.length,
        duration,
        contentType: response.result_content_type,
      };
    },
    onSuccess: (data) => {
      if (options.onSuccess) {
        options.onSuccess(data.result, data.duration, data.length);
      }
    },
    onError: (error: Error & { detail?: string }) => {
      if (options.onError) {
        options.onError({
          message: error.message || 'Failed to validate SHACL',
          detail: error.detail,
        });
      }
    },
  });

  return {
    validateSHACL: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
  };
};
