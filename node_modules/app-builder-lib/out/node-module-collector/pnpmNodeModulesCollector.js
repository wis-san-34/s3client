"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PnpmNodeModulesCollector = void 0;
const moduleManager_1 = require("./moduleManager");
const nodeModulesCollector_1 = require("./nodeModulesCollector");
const packageManager_1 = require("./packageManager");
class PnpmNodeModulesCollector extends nodeModulesCollector_1.NodeModulesCollector {
    constructor() {
        super(...arguments);
        this.installOptions = {
            manager: packageManager_1.PM.PNPM,
            lockfile: "pnpm-lock.yaml",
        };
    }
    getArgs() {
        return ["list", "--prod", "--json", "--depth", "Infinity", "--silent", "--loglevel=error"];
    }
    async extractProductionDependencyGraph(tree, dependencyId) {
        var _a;
        if (this.productionGraph[dependencyId]) {
            return;
        }
        this.productionGraph[dependencyId] = { dependencies: [] };
        if (((_a = tree.dedupedDependenciesCount) !== null && _a !== void 0 ? _a : 0) > 0) {
            const realDep = this.allDependencies.get(dependencyId);
            if (realDep) {
                this.cache.logSummary[moduleManager_1.LogMessageByKey.PKG_DUPLICATE_REF].push(dependencyId);
                tree = realDep;
            }
            else {
                this.cache.logSummary[moduleManager_1.LogMessageByKey.PKG_DUPLICATE_REF_UNRESOLVED].push(dependencyId);
                return;
            }
        }
        const packageName = tree.name || tree.from;
        const { packageJson } = (await this.cache.locatePackageVersion({ pkgName: packageName, parentDir: this.rootDir, requiredRange: tree.version })) || {};
        const all = packageJson ? { ...packageJson.dependencies, ...packageJson.optionalDependencies } : { ...tree.dependencies, ...tree.optionalDependencies };
        const optional = packageJson ? { ...packageJson.optionalDependencies } : {};
        const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) };
        this.productionGraph[dependencyId] = { dependencies: [] };
        const depPromises = Object.entries(deps).map(async ([packageName, dependency]) => {
            // First check if it's in production dependencies
            if (!all[packageName]) {
                return undefined;
            }
            // Then check if optional dependency path exists (using actual resolved path)
            if (optional[packageName]) {
                const pkg = await this.cache.locatePackageVersion({ pkgName: packageName, parentDir: this.rootDir, requiredRange: dependency.version });
                if (!pkg) {
                    this.cache.logSummary[moduleManager_1.LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED].push(`${packageName}@${dependency.version}`);
                    return undefined;
                }
            }
            const { id: childDependencyId, pkgOverride } = this.normalizePackageVersion(packageName, dependency);
            await this.extractProductionDependencyGraph(pkgOverride, childDependencyId);
            return childDependencyId;
        });
        const collectedDependencies = [];
        for (const dep of depPromises) {
            const result = await dep;
            if (result !== undefined) {
                collectedDependencies.push(result);
            }
        }
        this.productionGraph[dependencyId] = { dependencies: collectedDependencies };
    }
    async collectAllDependencies(tree) {
        var _a, _b, _c, _d;
        // Collect regular dependencies
        for (const [key, value] of Object.entries(tree.dependencies || {})) {
            if (((_a = value === null || value === void 0 ? void 0 : value.dedupedDependenciesCount) !== null && _a !== void 0 ? _a : 0) > 0) {
                continue;
            }
            const pkg = await this.cache.locatePackageVersion({ pkgName: key, parentDir: this.rootDir, requiredRange: value.version });
            this.allDependencies.set(`${key}@${value.version}`, { ...value, path: (_b = pkg === null || pkg === void 0 ? void 0 : pkg.packageDir) !== null && _b !== void 0 ? _b : value.path });
            await this.collectAllDependencies(value);
        }
        // Collect optional dependencies if they exist
        for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
            if (((_c = value === null || value === void 0 ? void 0 : value.dedupedDependenciesCount) !== null && _c !== void 0 ? _c : 0) > 0) {
                continue;
            }
            const pkg = await this.cache.locatePackageVersion({ pkgName: key, parentDir: this.rootDir, requiredRange: value.version });
            this.allDependencies.set(`${key}@${value.version}`, { ...value, path: (_d = pkg === null || pkg === void 0 ? void 0 : pkg.packageDir) !== null && _d !== void 0 ? _d : value.path });
            await this.collectAllDependencies(value);
        }
    }
    parseDependenciesTree(jsonBlob) {
        // pnpm returns an array of dependency trees
        const dependencyTree = this.extractJsonFromPollutedOutput(jsonBlob);
        return dependencyTree[0];
    }
}
exports.PnpmNodeModulesCollector = PnpmNodeModulesCollector;
//# sourceMappingURL=pnpmNodeModulesCollector.js.map