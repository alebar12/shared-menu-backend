import { MenuService } from "./MenuService";
import { Meal } from "./Objects";


export class MealService {
    constructor(
        private readonly db: D1Database,
        private readonly menuService: MenuService,
    ) {}

    public async getMeals(menuId: string): Promise<Meal[]> {
        await this.menuService.verifyMenuId(menuId);

        const result = await this.db
            .prepare(
                "SELECT DAY AS day, MEAL_TYPE AS mealType, MEAL AS meal " +
                    "FROM MEALS WHERE MENU_ID = ? ORDER BY DAY ASC",
            )
            .bind(menuId)
            .all<Meal>();

        return result.results;
    }

    public async addMeal(menuId: string, meal: Meal): Promise<void> {
        await this.menuService.verifyMenuId(menuId);

        await this.db
            .prepare(
                "INSERT INTO MEALS (MENU_ID, DAY, MEAL_TYPE, MEAL) VALUES (?, ?, ?, ?) " +
                    "ON CONFLICT (MENU_ID, DAY, MEAL_TYPE) DO UPDATE SET MEAL = excluded.MEAL",
            )
            .bind(menuId, meal.day, meal.mealType, meal.meal)
            .run();
    }

    public async deleteMealsOlderThanSevenDays(): Promise<void> {
        await this.db.prepare("DELETE FROM MEALS WHERE DAY < date('now', '-7 days')").run();
    }
}
