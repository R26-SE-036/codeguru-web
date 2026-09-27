/**
 * The sample Java files students fix during the user-testing session, served
 * as a zip by app/download/sample-java.
 *
 * TEMPORARY: remove this file, that route, SampleJavaLink in
 * components/app-shell.tsx and '/download/sample-java' in middleware.ts's
 * OPEN_PATHS once user testing is over.
 *
 * Kept as text rather than as files on disk: the standalone build copies only
 * what the server imports, so a folder of .java files next to the app would
 * be missing from the image.
 *
 * Every mistake in these files is one Code Coach detects. ClassAverageReport,
 * LibraryLogin and BankAccountSimulator each repeat one kind of mistake, which
 * is what makes Study Guider offer a lesson during the session.
 */
export interface SampleFile {
  name: string;
  text: string;
}

export const SAMPLE_FOLDER = 'sample-java';

export const SAMPLE_JAVA_FILES: readonly SampleFile[] = [
  {
    name: 'README.txt',
    text: `Code Guru - sample Java files for user testing

1. In VS Code choose File > Open Folder and open this sample-java folder.
2. Make sure the Code Coach extension is installed and you are signed in.
3. Work on ONE file at a time, in this order. Finish a file and close its tab
   before you open the next one.

   1. TotalMarksPrinter.java  (warm-up)
   2. LastItemPrinter.java  (warm-up)
   3. ClassAverageReport.java  (core)
   4. AttendanceChecker.java  (core)
   5. StudentGradeManager.java  (core)
   6. LibraryLogin.java  (core)
   7. BankAccountSimulator.java  (stretch)
   8. InventoryReportTool.java  (stretch)

Each file has one or more mistakes. Code Coach underlines them; use the hints
only when you need them.
`,
  },
  {
    name: 'TotalMarksPrinter.java',
    text: `public class TotalMarksPrinter {
    public static void main(String[] args) {
        int[] marks = {70, 55, 88, 92};
        int total = 0;
        for (int i = 0; i <= marks.length; i++) {
            total = total + marks[i];
        }
        System.out.println("Total: " + total);
    }
}
`,
  },
  {
    name: 'LastItemPrinter.java',
    text: `public class LastItemPrinter {
    public static void main(String[] args) {
        String[] queue = {"Amara", "Bimal", "Chathura"};
        System.out.println("Queue size: " + queue.length);
        System.out.println("Last person: " + queue[queue.length]);
    }
}
`,
  },
  {
    name: 'ClassAverageReport.java',
    text: `public class ClassAverageReport {
    public static void main(String[] args) {
        int[] quizScores = {14, 18, 9, 20, 16};
        int[] labScores = {45, 38, 50, 42, 47};

        int quizTotal = 0;
        for (int i = 0; i <= quizScores.length; i++) {
            quizTotal = quizTotal + quizScores[i];
        }
        System.out.println("Quiz average: " + (quizTotal / quizScores.length));

        int labTotal = 0;
        for (int i = 0; i <= labScores.length; i++) {
            labTotal = labTotal + labScores[i];
        }
        System.out.println("Lab average: " + (labTotal / labScores.length));
    }
}
`,
  },
  {
    name: 'AttendanceChecker.java',
    text: `public class AttendanceChecker {
    public static void main(String[] args) {
        int attendedDays = 40;
        int totalDays = 100;
        boolean eligible = attendedDays > 80;
        if (eligible = true) {
            System.out.println("Allowed to sit the exam");
        }
        System.out.println("Attendance: " + attendedDays + "/" + totalDays);
    }
}
`,
  },
  {
    name: 'StudentGradeManager.java',
    text: `public class StudentGradeManager {

    public static void main(String[] args) {
        String[] students = {"Amara", "Bimal", "Chathura", "Dilini"};
        int[] marks = {72, 45, 88, 63};

        System.out.println("=== Student Grade Manager ===");

        for (int i = 0; i < marks.length; i++) {
            String grade = gradeFor(marks[i]);
            System.out.println(students[i] + " scored " + marks[i] + " -> grade " + grade);
        }

        verifyRecord(new String("Chathura"));
        System.out.println("All students processed.");
    }

    static String gradeFor(int mark) {
        if (mark >= 75) {
            return "A";
        } else if (mark >= 65) {
            return "B";
        } else if (mark >= 65) {
            return "C";
        } else {
            return "F";
        }
    }

    static void verifyRecord(String name) {
        if (name == "Chathura") {
            System.out.println("Record verified for " + name);
        } else {
            System.out.println("WARNING: could not verify record for " + name);
        }
    }
}
`,
  },
  {
    name: 'LibraryLogin.java',
    text: `public class LibraryLogin {
    public static void main(String[] args) {
        String typedUsername = "LIBRARIAN".toLowerCase();
        String typedPassword = "open" + "sesame".trim();

        if (typedUsername == "librarian") {
            System.out.println("Username accepted.");
        } else {
            System.out.println("Unknown username.");
        }

        if (typedPassword == "opensesame") {
            System.out.println("Welcome to the library system.");
        } else {
            System.out.println("Wrong password, access denied.");
        }
    }
}
`,
  },
  {
    name: 'BankAccountSimulator.java',
    text: `public class BankAccountSimulator {

    public static void main(String[] args) {
        String owner = "ravindu nethmina";
        double balance = 500.00;

        owner.toUpperCase();
        System.out.println("Welcome back, " + owner);

        int menuChoice = 1;
        System.out.println("You selected option " + menuChoice + " (view balance)");
        switch (menuChoice) {
            case 1:
                System.out.println("Your balance is Rs. " + balance);
            case 2:
                balance = deposit(balance, 250.00);
            case 3:
                System.out.println("Thank you, logging out.");
                break;
        }

        double fee = monthlyFee(balance);
        System.out.println("Monthly account fee: Rs. " + fee);

        int emailsSent = 0;
        while (emailsSent < 3) {
            System.out.println("Sending monthly statement email...");
        }
        System.out.println("All statements sent.");
    }

    static double deposit(double balance, double amount) {
        double newBalance = balance + amount;
        newBalance = newBalance;
        System.out.println("Deposited Rs. " + amount);
        return newBalance;
    }

    static double monthlyFee(double balance) {
        
        System.out.println("Fee calculation finished.");
        return balance * 0.01;
    }
}
`,
  },
  {
    name: 'InventoryReportTool.java',
    text: `public class InventoryReportTool {

    public static void main(String[] args) {
        String[] items = {"Laptop", "Mouse", "Keyboard", "Monitor"};
        int[] stock = {12, 3, 25, 7};

        System.out.println("=== Inventory Report Tool ===");

        validateCategory(2);
        warnLowStock(items, stock);
        printStockReport(items, stock);

        System.out.println("Average units per delivery: " + averagePerDelivery(stock));

        countDownRestock(items);

        System.out.println("Inventory check complete.");
    }

    static void validateCategory(int categoryCode) {
        if (categoryCode != 1 || categoryCode != 2) {
            System.out.println("Invalid category code: " + categoryCode);
        } else {
            System.out.println("Category " + categoryCode + " accepted.");
        }
    }

    static void warnLowStock(String[] items, int[] stock) {
        int lowStockLimit = 5;
        for (int i = 0; i < items.length; i++) {
            if (stock[i] < lowStockLimit); {
                System.out.println("LOW STOCK WARNING: " + items[i] + " (" + stock[i] + " left)");
            }
        }
    }

    static void printStockReport(String[] items, int[] stock) {
        System.out.println("--- Stock report ---");
        for (int row = 10; row < 4; row++) {
            System.out.println(items[row % items.length] + " : " + stock[row % stock.length]);
        }
        System.out.println("--- End of report ---");
    }

    static int averagePerDelivery(int[] stock) {
        int total = 0;
        for (int i = 0; i < stock.length; i++) {
            total = total + stock[i];
        }
        return total / 0;
    }

    static void countDownRestock(String[] items) {
        for (int i = 0; i < items.length; i--) {
            System.out.println("Restocking " + items[i]);
        }
    }
}
`,
  },
];
