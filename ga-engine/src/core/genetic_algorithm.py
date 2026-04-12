import random
import numpy as np
from deap import base, creator, tools, algorithms
from typing import List, Tuple

# Evitar redefinição de tipos no DEAP
if not hasattr(creator, "FitnessMax"):
    creator.create("FitnessMax", base.Fitness, weights=(1.0,))
if not hasattr(creator, "Individual"):
    creator.create("Individual", list, fitness=creator.FitnessMax)


class GeneticAlgorithm:
    def __init__(self, population_size: int = 200, generations: int = 50, num_assets: int = 3):
        self.population_size = population_size
        self.generations = generations
        self.num_assets = num_assets
        self.toolbox = self._setup_toolbox()

    def _random_weight(self) -> float:
        return random.random()

    def _normalize(self, individual: list) -> list:
        total = sum(individual)
        if total == 0:
            return [1 / self.num_assets] * self.num_assets
        return [w / total for w in individual]

    def _evaluate(self, individual: list) -> Tuple[float]:
        weights = self._normalize(individual)
        # Fitness = Sortino ratio simulado baseado nos pesos
        np.random.seed(int(sum(weights) * 1000) % 999)
        returns = np.random.normal(0.001, 0.02, 252)
        weighted_returns = returns * np.random.choice(weights)
        mean = np.mean(weighted_returns)
        downside = np.sqrt(np.mean(np.minimum(weighted_returns, 0) ** 2))
        sortino = mean / downside if downside > 0 else 0
        return (max(sortino, 0),)

    def _setup_toolbox(self) -> base.Toolbox:
        toolbox = base.Toolbox()
        toolbox.register("attr_weight", self._random_weight)
        toolbox.register("individual", tools.initRepeat, creator.Individual, toolbox.attr_weight, n=self.num_assets)
        toolbox.register("population", tools.initRepeat, list, toolbox.individual)
        toolbox.register("evaluate", self._evaluate)
        toolbox.register("mate", tools.cxUniform, indpb=0.5)
        toolbox.register("mutate", tools.mutGaussian, mu=0, sigma=0.05, indpb=0.2)
        toolbox.register("select", tools.selTournament, tournsize=5)
        return toolbox

    def run(self) -> Tuple[List[float], List[dict]]:
        pop = self.toolbox.population(n=self.population_size)
        history = []

        # Avaliação inicial
        fitnesses = list(map(self.toolbox.evaluate, pop))
        for ind, fit in zip(pop, fitnesses):
            ind.fitness.values = fit

        for gen in range(self.generations):
            # Seleção e reprodução
            offspring = self.toolbox.select(pop, len(pop))
            offspring = list(map(self.toolbox.clone, offspring))

            for c1, c2 in zip(offspring[::2], offspring[1::2]):
                if random.random() < 0.7:
                    self.toolbox.mate(c1, c2)
                    del c1.fitness.values
                    del c2.fitness.values

            for mut in offspring:
                if random.random() < 0.2:
                    self.toolbox.mutate(mut)
                    del mut.fitness.values

            # Avaliar inválidos
            invalid = [ind for ind in offspring if not ind.fitness.valid]
            fitnesses = list(map(self.toolbox.evaluate, invalid))
            for ind, fit in zip(invalid, fitnesses):
                ind.fitness.values = fit

            pop[:] = offspring
            best_fit = max(ind.fitness.values[0] for ind in pop)
            avg_fit = sum(ind.fitness.values[0] for ind in pop) / len(pop)

            history.append({
                "generation": gen + 1,
                "best_fitness": round(best_fit, 6),
                "avg_fitness": round(avg_fit, 6),
            })

        best = tools.selBest(pop, 1)[0]
        return self._normalize(list(best)), history
