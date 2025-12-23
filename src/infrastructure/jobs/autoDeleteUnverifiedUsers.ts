import { AutoDeleteUnverifiedUsersUseCase } from "../../application/useCases/cleanup/AutoDeleteUnverifiedUsersUseCase";

export const runAutoDeleteUnverifiedUsers = async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const useCase = new AutoDeleteUnverifiedUsersUseCase();
  return useCase.execute({ cutoffDate: cutoff });
};

